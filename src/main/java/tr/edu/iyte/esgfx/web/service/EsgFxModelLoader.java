package tr.edu.iyte.esgfx.web.service;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import org.springframework.stereotype.Service;

import tr.edu.iyte.esgfx.api.LoadedSplModel;
import tr.edu.iyte.esgfx.api.SingleProductTestGenerationAPI;

/**
 * Loads a feature model and ESG-Fx pair, either from the bundled examples or
 * from content supplied with the request.
 */
@Service
public class EsgFxModelLoader {

    /** Generous next to the bundled examples, whose largest pair is under 40 KB. */
    public static final int MAX_MODEL_BYTES = 1024 * 1024;

    private static final Map<String, ExampleFiles> EXAMPLES = Map.of(
            "SVM", new ExampleFiles(
                    "lib/esg-core/files/Cases/SodaVendingMachine/SVM_ESGFx.mxe",
                    "lib/esg-core/files/Cases/SodaVendingMachine/configs/model.xml"),
            "eM", new ExampleFiles(
                    "lib/esg-core/files/Cases/eMail/eM_ESGFx.mxe",
                    "lib/esg-core/files/Cases/eMail/configs/model.xml"),
            "El", new ExampleFiles(
                    "lib/esg-core/files/Cases/Elevator/El_ESGFx.mxe",
                    "lib/esg-core/files/Cases/Elevator/configs/model.xml"));

    public LoadedSplModel load(String shortName) {
        ExampleFiles files = EXAMPLES.get(shortName);
        if (files == null) {
            throw new IllegalArgumentException("Unknown example: " + shortName);
        }

        String mxePath = requireExisting(files.mxe());
        String modelPath = requireExisting(files.featureModel());

        try {
            return SingleProductTestGenerationAPI.load(modelPath, mxePath);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to load example " + shortName, e);
        }
    }

    /**
     * Loads a model supplied with the request. The engine's converter reads
     * from paths rather than streams, so the content is staged in a temporary
     * directory that is removed before returning — nothing about the upload
     * outlives the request, which is what keeps the service stateless.
     */
    public LoadedSplModel loadFromContent(String featureModelXml, String esgFxXml) {
        requireWithinLimit(featureModelXml, "Feature model");
        requireWithinLimit(esgFxXml, "ESG-Fx");

        Path directory = null;
        try {
            directory = Files.createTempDirectory("esgfx-upload");
            Path featureModelPath = directory.resolve("model.xml");
            Path esgFxPath = directory.resolve("model.mxe");
            Files.writeString(featureModelPath, featureModelXml, StandardCharsets.UTF_8);
            Files.writeString(esgFxPath, esgFxXml, StandardCharsets.UTF_8);

            LoadedSplModel model = SingleProductTestGenerationAPI.load(
                    featureModelPath.toString(), esgFxPath.toString());
            requireUsable(model);
            return model;
        } catch (IOException e) {
            throw new IllegalStateException("Could not stage the uploaded model", e);
        } catch (InvalidModelException e) {
            throw e;
        } catch (Exception e) {
            throw new InvalidModelException(
                    "The uploaded files could not be read as a feature model and an ESG-Fx. "
                            + rootMessage(e));
        } finally {
            deleteRecursively(directory);
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

    /** The example's feature model file as written, for callers that need what the graph export drops. */
    public String featureModelXmlOf(String shortName) {
        ExampleFiles files = EXAMPLES.get(shortName);
        if (files == null) {
            throw new IllegalArgumentException("Unknown example: " + shortName);
        }
        try {
            return Files.readString(Path.of(requireExisting(files.featureModel())), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("Could not read the feature model for " + shortName, e);
        }
    }

    private static String requireExisting(String relativePath) {
        File file = new File(relativePath);
        if (!file.exists()) {
            throw new IllegalStateException(
                    "Required example file not found: " + file.getAbsolutePath());
        }
        return file.getAbsolutePath();
    }

    private record ExampleFiles(String mxe, String featureModel) {
    }
}
