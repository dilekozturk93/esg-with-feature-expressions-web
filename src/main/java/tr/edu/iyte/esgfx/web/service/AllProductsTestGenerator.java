package tr.edu.iyte.esgfx.web.service;

import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;

import tr.edu.iyte.esgfx.api.AllProductsTestGenerationAPI;
import tr.edu.iyte.esgfx.api.LoadedSplModel;
import tr.edu.iyte.esgfx.api.SingleProductTestGenerationAPI;
import tr.edu.iyte.esgfx.api.SingleProductTestResult;

/**
 * Generates tests for every valid product configuration of a preloaded SPL by
 * delegating to the engine's {@code AllProductsTestGenerationAPI}.
 */
@Service
public class AllProductsTestGenerator {

    /**
     * Configuration counts grow exponentially with the feature count, and the
     * whole request is held in memory and answered in one response, so models
     * beyond this are refused rather than left to exhaust the server.
     */
    public static final long MAX_CONFIGURATIONS = 200;

    private final EsgFxModelLoader loader;

    public AllProductsTestGenerator(EsgFxModelLoader loader) {
        this.loader = loader;
    }

    public List<TestGenerationResult> generate(String splShortName, int coverageLength) throws Exception {
        if (coverageLength < 1 || coverageLength > 4) {
            throw new IllegalArgumentException("coverageLength must be in [1, 4], got " + coverageLength);
        }

        LoadedSplModel model = loader.load(splShortName);

        long configurationCount = SingleProductTestGenerationAPI.countValidConfigurations(model);
        if (configurationCount > MAX_CONFIGURATIONS) {
            throw new TooManyConfigurationsException(configurationCount, MAX_CONFIGURATIONS);
        }

        List<SingleProductTestResult> results =
                AllProductsTestGenerationAPI.generateForAllProducts(model, coverageLength);

        List<TestGenerationResult> converted = new ArrayList<>(results.size());
        for (SingleProductTestResult result : results) {
            converted.add(new TestGenerationResult(
                    splShortName,
                    result.getProductId(),
                    result.getSelection(),
                    result.getCoverageLength(),
                    result.getCoverageType(),
                    result.getCoveragePercentage(),
                    result.getTestSequencesAsEventNames(),
                    result.getSequenceCount(),
                    result.getTotalEventCount(),
                    result.getGenerationTimeMs()));
        }
        return converted;
    }
}
