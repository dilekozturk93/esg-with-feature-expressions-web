package tr.edu.iyte.esgfx.web.service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import tr.edu.iyte.esgfx.api.LoadedSplModel;
import tr.edu.iyte.esgfx.api.SingleProductTestGenerationAPI;
import tr.edu.iyte.esgfx.model.featuremodel.Feature;

/**
 * Loads a feature model and ESG-Fx pair, either from the bundled examples or
 * from content supplied with the request.
 *
 * <p>The bundled examples travel inside the jar rather than being read from the
 * submodule's working tree, so the packaged application runs from any directory
 * — which is what a container image and a downloaded artifact both need. The
 * build copies them in from the submodule, which stays their source of truth.
 */
@Service
public class EsgFxModelLoader {

    /** Generous next to the bundled examples, whose largest pair is under 40 KB. */
    public static final int MAX_MODEL_BYTES = 1024 * 1024;

    private static final Map<String, ExampleFiles> EXAMPLES = Map.of(
            "SVM", new ExampleFiles("examples/SVM/SVM_ESGFx.mxe", "examples/SVM/configs/model.xml"),
            "eM", new ExampleFiles("examples/eM/eM_ESGFx.mxe", "examples/eM/configs/model.xml"),
            "El", new ExampleFiles("examples/El/El_ESGFx.mxe", "examples/El/configs/model.xml"));

    public LoadedSplModel load(String shortName) {
        ExampleFiles files = examplesFor(shortName);
        try {
            return stageAndLoad(readResource(files.featureModel()), readResource(files.mxe()));
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("Failed to load example " + shortName, e);
        }
    }

    /** The example's feature model as written, for callers that need what the graph export drops. */
    public String featureModelXmlOf(String shortName) {
        return readResource(examplesFor(shortName).featureModel());
    }

    /**
     * Loads a model supplied with the request.
     */
    public LoadedSplModel loadFromContent(String featureModelXml, String esgFxXml) {
        requireWithinLimit(featureModelXml, "Feature model");
        requireWithinLimit(esgFxXml, "ESG-Fx");
        try {
            return stageAndLoad(featureModelXml, esgFxXml);
        } catch (InvalidModelException | IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new InvalidModelException(
                    "The uploaded files could not be read as a feature model and an ESG-Fx. "
                            + rootMessage(e));
        }
    }

    /**
     * The engine's converter reads from paths rather than streams, so the content
     * is staged in a temporary directory that is removed before returning —
     * nothing about a request outlives it, which is what keeps the service
     * stateless whether the model came from the jar or from an upload.
     */
    private LoadedSplModel stageAndLoad(String featureModelXml, String esgFxXml) throws Exception {
        Path directory = null;
        try {
            directory = Files.createTempDirectory("esgfx-model");
            Path featureModelPath = directory.resolve("model.xml");
            Path esgFxPath = directory.resolve("model.mxe");
            Files.writeString(featureModelPath, featureModelXml, StandardCharsets.UTF_8);
            Files.writeString(esgFxPath, esgFxXml, StandardCharsets.UTF_8);

            LoadedSplModel model = SingleProductTestGenerationAPI.load(
                    featureModelPath.toString(), esgFxPath.toString());
            requireUsable(model);
            return model;
        } catch (IOException e) {
            throw new IllegalStateException("Could not stage the model", e);
        } finally {
            deleteRecursively(directory);
        }
    }

    private static ExampleFiles examplesFor(String shortName) {
        ExampleFiles files = EXAMPLES.get(shortName);
        if (files == null) {
            throw new IllegalArgumentException("Unknown example: " + shortName);
        }
        return files;
    }

    private static String readResource(String path) {
        // Pinned to this class's loader on purpose. Generation runs on a
        // ForkJoinPool thread, whose context class loader is not the one Spring
        // Boot's executable jar launches with, so the default lookup cannot see
        // BOOT-INF/classes — a miss that only appears once the app is packaged.
        try (InputStream in = new ClassPathResource(path,
                EsgFxModelLoader.class.getClassLoader()).getInputStream()) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("Bundled example resource is missing: " + path
                    + ". The build copies these in from lib/esg-core; check that the submodule "
                    + "was checked out before packaging.", e);
        }
    }

    /**
     * Well-formed XML in the wrong shape parses without complaint and yields an
     * empty model, which only fails much later and as a server error. Catching
     * it here turns it into an answer the caller can act on.
     */
    private static void requireUsable(LoadedSplModel model) {
        if (model.getFeatureModel() == null || model.getFeatureModel().getRoot() == null) {
            throw new InvalidModelException(
                    "No feature model was found in the uploaded file. It should be FeatureIDE XML "
                            + "with a <featureModel> root.");
        }
        if (model.getFeatureExpressionMap() == null || model.getFeatureExpressionMap().isEmpty()) {
            throw new InvalidModelException("The uploaded feature model declares no features.");
        }
        if (model.getEsgFx() == null || model.getEsgFx().getVertexList().isEmpty()) {
            throw new InvalidModelException(
                    "No ESG-Fx was found in the uploaded file. It should be an .mxe graph.");
        }

        // A feature only reaches the engine through the events it labels: the
        // expression map is built from the ESG-Fx, so a concrete feature no event
        // mentions has no variable, and the solver rejects the clause that would
        // refer to it. Caught here, it is an answer rather than a server error.
        List<String> unusedFeatures = new ArrayList<>();
        for (Feature feature : model.getFeatureModel().getFeatureSet()) {
            if (!feature.isAbstract() && !model.getFeatureExpressionMap().containsKey(feature.getName())) {
                unusedFeatures.add(feature.getName());
            }
        }
        if (!unusedFeatures.isEmpty()) {
            throw new InvalidModelException("These features label no event: "
                    + String.join(", ", unusedFeatures)
                    + ". Every concrete feature must appear in at least one event's feature "
                    + "expression, or be marked abstract.");
        }
    }

    private static void requireWithinLimit(String content, String what) {
        if (content == null || content.isBlank()) {
            throw new InvalidModelException(what + " file is missing or empty.");
        }
        if (content.getBytes(StandardCharsets.UTF_8).length > MAX_MODEL_BYTES) {
            throw new InvalidModelException(what + " file is larger than the "
                    + (MAX_MODEL_BYTES / 1024) + " KB limit.");
        }
    }

    private static String rootMessage(Throwable error) {
        Throwable cause = error;
        while (cause.getCause() != null) {
            cause = cause.getCause();
        }
        return cause.getMessage() == null ? cause.getClass().getSimpleName() : cause.getMessage();
    }

    private static void deleteRecursively(Path directory) {
        if (directory == null) {
            return;
        }
        try (var paths = Files.walk(directory)) {
            paths.sorted(java.util.Comparator.reverseOrder()).forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                } catch (IOException ignored) {
                    // A leftover temp file is harmless; the OS reclaims it.
                }
            });
        } catch (IOException ignored) {
            // Same.
        }
    }

    private record ExampleFiles(String mxe, String featureModel) {
    }
}
