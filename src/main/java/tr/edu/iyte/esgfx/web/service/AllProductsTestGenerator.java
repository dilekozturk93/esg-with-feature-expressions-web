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
     * The whole run is held in memory and answered in one response, and the
     * number of products grows with the feature count, so all-products is bound
     * by how many concrete features a model has rather than by a fixed product
     * count. This admits models with thousands of products (the Student
     * Attendance System has 2664) while still refusing the ones whose product
     * space is too large to enumerate into a single response.
     */
    public static final int MAX_FEATURES = 25;

    /** Concrete features are those that label an event; a valid model has every one of them. */
    private static int concreteFeatureCount(LoadedSplModel model) {
        return model.getFeatureExpressionMap().size();
    }

    /** Null when all-products may run for this model, otherwise the reason it may not. */
    public static String blockReason(LoadedSplModel model) {
        int features = concreteFeatureCount(model);
        if (features > MAX_FEATURES) {
            return "This feature model has " + features + " features, above the " + MAX_FEATURES
                    + " that all-products allows — beyond that the number of products is too large to "
                    + "generate in one run. Sample instead, or generate for specific products.";
        }
        return null;
    }

    public static boolean isAllProductsAllowed(LoadedSplModel model) {
        return blockReason(model) == null;
    }

    private final SplModelResolver resolver;

    public AllProductsTestGenerator(SplModelResolver resolver) {
        this.resolver = resolver;
    }

    public List<TestGenerationResult> generate(ModelSource source, int coverageLength) throws Exception {
        if (coverageLength < 1 || coverageLength > 4) {
            throw new IllegalArgumentException("coverageLength must be in [1, 4], got " + coverageLength);
        }

        LoadedSplModel model = resolver.resolve(source);

        String reason = blockReason(model);
        if (reason != null) {
            throw new TooManyConfigurationsException(reason, concreteFeatureCount(model), MAX_FEATURES);
        }

        List<SingleProductTestResult> results =
                AllProductsTestGenerationAPI.generateForAllProducts(model, coverageLength);

        List<TestGenerationResult> converted = new ArrayList<>(results.size());
        for (SingleProductTestResult result : results) {
            converted.add(new TestGenerationResult(
                    source.displayName(),
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
