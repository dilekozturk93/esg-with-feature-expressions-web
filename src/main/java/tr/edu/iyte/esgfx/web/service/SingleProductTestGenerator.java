package tr.edu.iyte.esgfx.web.service;

import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;

import tr.edu.iyte.esgfx.api.LoadedSplModel;
import tr.edu.iyte.esgfx.api.SingleProductTestGenerationAPI;
import tr.edu.iyte.esgfx.api.SingleProductTestResult;

/**
 * Generates test sequences for a single user-specified product configuration
 * by delegating to the engine's {@code SingleProductTestGenerationAPI}. The
 * engine owns the pipeline (product derivation, transformation, balancing,
 * Euler cycle, coverage analysis); this service only adapts the web request
 * and response shapes.
 */
@Service
public class SingleProductTestGenerator {

    /**
     * The engine names the derived product model after a product ID. A web
     * request describes one ad-hoc configuration rather than a position in an
     * enumeration, so the ID is fixed; it affects naming only.
     */
    private static final int WEB_PRODUCT_ID = 1;

    private final EsgFxModelLoader loader;

    public SingleProductTestGenerator(EsgFxModelLoader loader) {
        this.loader = loader;
    }

    public TestGenerationResult generate(String splShortName, Set<String> selectedFeatures,
            int coverageLength) throws Exception {

        if (coverageLength < 1 || coverageLength > 4) {
            throw new IllegalArgumentException("coverageLength must be in [1, 4], got " + coverageLength);
        }

        LoadedSplModel model = loader.load(splShortName);
        Map<String, Boolean> selection =
                FeatureSelectionMapper.completeSelection(model.getFeatureExpressionMap(), selectedFeatures);

        SingleProductTestResult result = SingleProductTestGenerationAPI.generate(
                model, WEB_PRODUCT_ID, selection, coverageLength);

        return new TestGenerationResult(
                splShortName,
                selectedFeatures,
                result.getCoverageLength(),
                result.getCoverageType(),
                result.getCoveragePercentage(),
                result.getTestSequencesAsEventNames(),
                result.getSequenceCount(),
                result.getTotalEventCount(),
                result.getGenerationTimeMs());
    }
}
