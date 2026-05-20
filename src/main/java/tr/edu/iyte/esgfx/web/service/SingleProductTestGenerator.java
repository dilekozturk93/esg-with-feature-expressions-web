package tr.edu.iyte.esgfx.web.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Service;

import tr.edu.iyte.esg.eventsequence.EventSequence;
import tr.edu.iyte.esg.model.ESG;
import tr.edu.iyte.esg.model.Vertex;
import tr.edu.iyte.esgfx.testgeneration.EulerCycleToTestSequenceGenerator;
import tr.edu.iyte.esgfx.testgeneration.edgecoverage.EdgeCoverageAnalyser;
import tr.edu.iyte.esgfx.testgeneration.edgecoverage.EulerCycleGeneratorForEdgeCoverage;
import tr.edu.iyte.esgfx.testgeneration.eventcoverage.EulerCycleGeneratorForEventCoverage;
import tr.edu.iyte.esgfx.testgeneration.eventcoverage.EventCoverageAnalyser;
import tr.edu.iyte.esgfx.testgeneration.eventtriplecoverage.TransformedESGFxGenerator;
import tr.edu.iyte.esgfx.testgeneration.util.StronglyConnectedBalancedESGFxGeneration;

/**
 * Generates test sequences for a single user-specified product configuration.
 * Dispatches to the engine's event-coverage path (L=1) or edge-coverage path
 * (L=2,3,4), mirroring the per-product body of the engine's
 * {@code RQ1_ComparativeEfficiency_ESGFx_L1} and {@code _L234} pipelines.
 */
@Service
public class SingleProductTestGenerator {

    private final EsgFxModelLoader loader;
    private final ConfigurationValidator configurationValidator;

    public SingleProductTestGenerator(EsgFxModelLoader loader,
            ConfigurationValidator configurationValidator) {
        this.loader = loader;
        this.configurationValidator = configurationValidator;
    }

    public TestGenerationResult generate(String splShortName, Set<String> selectedFeatures,
            int coverageLength) throws Exception {

        if (coverageLength < 1 || coverageLength > 4) {
            throw new IllegalArgumentException("coverageLength must be in [1, 4], got " + coverageLength);
        }

        EsgFxExample example = loader.load(splShortName);

        ConfigurationValidator.ValidationResult validation =
                configurationValidator.validate(example, selectedFeatures);
        if (!validation.valid()) {
            throw new InvalidConfigurationException(validation.errors());
        }

        long startNanos = System.nanoTime();
        Set<EventSequence> sequences;
        double coverage;
        String coverageType;

        if (coverageLength == 1) {
            sequences = generateForEventCoverage(example);
            coverage = new EventCoverageAnalyser()
                    .analyseEventCoverage(example.esg(), sequences, example.featureExpressionMap());
            coverageType = "event";
        } else {
            sequences = generateForEdgeCoverage(example, coverageLength);
            coverage = new EdgeCoverageAnalyser()
                    .analyseEdgeCoverage(example.esg(), sequences, example.featureExpressionMap());
            coverageType = "edge";
        }
        long generationTimeMs = (System.nanoTime() - startNanos) / 1_000_000L;

        List<List<String>> testSequences = new ArrayList<>(sequences.size());
        int totalEventCount = 0;
        for (EventSequence sequence : sequences) {
            List<String> events = new ArrayList<>(sequence.length());
            for (Vertex vertex : sequence.getEventSequence()) {
                events.add(vertex.getEvent().getName());
            }
            testSequences.add(events);
            totalEventCount += events.size();
        }

        return new TestGenerationResult(
                example.shortName(),
                selectedFeatures,
                coverageLength,
                coverageType,
                coverage,
                testSequences,
                testSequences.size(),
                totalEventCount,
                generationTimeMs);
    }

    private Set<EventSequence> generateForEventCoverage(EsgFxExample example) {
        ESG balanced = StronglyConnectedBalancedESGFxGeneration
                .getStronglyConnectedBalancedESGFxGeneration(example.esg());

        EulerCycleGeneratorForEventCoverage cycleGenerator =
                new EulerCycleGeneratorForEventCoverage(example.featureExpressionMap());
        cycleGenerator.generateEulerCycle(balanced);
        List<Vertex> cycle = cycleGenerator.getEulerCycle();

        return new EulerCycleToTestSequenceGenerator().CESgenerator(cycle);
    }

    private Set<EventSequence> generateForEdgeCoverage(EsgFxExample example, int coverageLength) {
        ESG transformed = new TransformedESGFxGenerator()
                .generateTransformedESGFx(coverageLength, example.esg());
        ESG balanced = StronglyConnectedBalancedESGFxGeneration
                .getStronglyConnectedBalancedESGFxGeneration(transformed);

        EulerCycleGeneratorForEdgeCoverage cycleGenerator = new EulerCycleGeneratorForEdgeCoverage();
        cycleGenerator.generateEulerCycle(balanced);
        List<Vertex> cycle = cycleGenerator.getEulerCycle();

        return new EulerCycleToTestSequenceGenerator().CESgenerator(cycle);
    }
}
