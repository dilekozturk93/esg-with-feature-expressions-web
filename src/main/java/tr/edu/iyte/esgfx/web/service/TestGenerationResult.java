package tr.edu.iyte.esgfx.web.service;

import java.util.List;
import java.util.Set;

public record TestGenerationResult(
        String splShortName,
        Set<String> selectedFeatures,
        int coverageLength,
        String coverageType,
        double coveragePercentage,
        List<List<String>> testSequences,
        int sequenceCount,
        int totalEventCount,
        long generationTimeMs) {
}
