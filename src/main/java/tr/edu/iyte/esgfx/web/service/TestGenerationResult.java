package tr.edu.iyte.esgfx.web.service;

import java.util.List;
import java.util.Map;

public record TestGenerationResult(
        String splShortName,
        int productId,
        Map<String, Boolean> featureSelection,
        int coverageLength,
        String coverageType,
        double coveragePercentage,
        List<List<String>> testSequences,
        int sequenceCount,
        int totalEventCount,
        long generationTimeMs) {
}
