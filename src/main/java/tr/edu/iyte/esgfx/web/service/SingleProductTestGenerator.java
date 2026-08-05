package tr.edu.iyte.esgfx.web.service;

import java.util.Map;

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

    private final EsgFxModelLoader loader;

    public SingleProductTestGenerator(EsgFxModelLoader loader) {
        this.loader = loader;
    }

    public TestGenerationResult generate(String splShortName, Map<String, Boolean> requestedSelection,
            int productId, int coverageLength) throws Exception {

        if (coverageLength < 1 || coverageLength > 4) {
            throw new IllegalArgumentException("coverageLength must be in [1, 4], got " + coverageLength);
        }

        LoadedSplModel model = loader.load(splShortName);
        Map<String, Boolean> selection =
                FeatureSelectionMapper.completeSelection(model.getFeatureExpressionMap(), requestedSelection);

        SingleProductTestResult result = SingleProductTestGenerationAPI.generate(
                model, productId, selection, coverageLength);

        return new TestGenerationResult(
                splShortName,
                result.getProductId(),
                selection,
                result.getCoverageLength(),
                result.getCoverageType(),
                result.getCoveragePercentage(),
                result.getTestSequencesAsEventNames(),
                result.getSequenceCount(),
                result.getTotalEventCount(),
                result.getGenerationTimeMs());
    }
}
