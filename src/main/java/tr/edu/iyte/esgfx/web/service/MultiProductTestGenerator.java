package tr.edu.iyte.esgfx.web.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import tr.edu.iyte.esgfx.api.LoadedSplModel;
import tr.edu.iyte.esgfx.api.MultiProductTestGenerationAPI;
import tr.edu.iyte.esgfx.api.SingleProductTestResult;

/**
 * Generates tests for an explicit set of product configurations by delegating
 * to the engine's {@code MultiProductTestGenerationAPI}.
 */
@Service
public class MultiProductTestGenerator {

    private final SplModelResolver resolver;

    public MultiProductTestGenerator(SplModelResolver resolver) {
        this.resolver = resolver;
    }

    public List<TestGenerationResult> generate(ModelSource source,
            List<Map<String, Boolean>> requestedSelections, int coverageLength) throws Exception {

        if (coverageLength < 1 || coverageLength > 4) {
            throw new IllegalArgumentException("coverageLength must be in [1, 4], got " + coverageLength);
        }
        if (requestedSelections.isEmpty()) {
            throw new IllegalArgumentException("At least one product configuration is required");
        }

        LoadedSplModel model = resolver.resolve(source);

        List<Map<String, Boolean>> selections = new ArrayList<>(requestedSelections.size());
        for (Map<String, Boolean> requested : requestedSelections) {
            selections.add(FeatureSelectionMapper.completeSelection(
                    model.getFeatureExpressionMap(), requested));
        }

        List<SingleProductTestResult> results =
                MultiProductTestGenerationAPI.generateForProducts(model, selections, coverageLength);

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
