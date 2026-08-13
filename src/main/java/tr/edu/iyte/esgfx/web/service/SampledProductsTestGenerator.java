package tr.edu.iyte.esgfx.web.service;

import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;

import tr.edu.iyte.esgfx.api.LoadedSplModel;
import tr.edu.iyte.esgfx.api.SampledProductsTestGenerationAPI;
import tr.edu.iyte.esgfx.api.SingleProductTestResult;

/**
 * Generates tests for a sample of a model's valid product configurations by
 * delegating to the engine's {@code SampledProductsTestGenerationAPI}.
 *
 * <p>Unlike all-products, this is not gated on the configuration count: the
 * count bounds how much gets <em>generated</em> there, whereas here the user's
 * sample size does that. What the sampler still pays is a walk of the
 * enumeration, and the request timeout is what bounds that.
 */
@Service
public class SampledProductsTestGenerator {

    public static final int MAX_SAMPLE_SIZE = 200;

    private final SplModelResolver resolver;

    public SampledProductsTestGenerator(SplModelResolver resolver) {
        this.resolver = resolver;
    }

    public List<TestGenerationResult> generate(ModelSource source, int sampleSize, Long seed,
            int coverageLength) throws Exception {

        if (coverageLength < 1 || coverageLength > 4) {
            throw new IllegalArgumentException("coverageLength must be in [1, 4], got " + coverageLength);
        }
        if (sampleSize < 1 || sampleSize > MAX_SAMPLE_SIZE) {
            throw new IllegalArgumentException(
                    "sampleSize must be in [1, " + MAX_SAMPLE_SIZE + "], got " + sampleSize);
        }

        LoadedSplModel model = resolver.resolve(source);
        long effectiveSeed = seed == null ? SampledProductsTestGenerationAPI.DEFAULT_SEED : seed;

        List<SingleProductTestResult> results = SampledProductsTestGenerationAPI.generateForSample(
                model, new tr.edu.iyte.esgfx.api.UniformEnumerationSampler(),
                sampleSize, effectiveSeed, coverageLength);

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
