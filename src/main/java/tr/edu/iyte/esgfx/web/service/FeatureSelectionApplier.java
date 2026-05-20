package tr.edu.iyte.esgfx.web.service;

import java.util.Map;
import java.util.Set;

import tr.edu.iyte.esgfx.model.featureexpression.FeatureExpression;

/**
 * Applies a user feature selection to the engine's feature-expression map by
 * flipping truth values on each non-negation entry. Negation entries (keys
 * containing '!') are intentionally left alone — the engine derives their
 * value from the positive entry.
 */
final class FeatureSelectionApplier {

    private FeatureSelectionApplier() {
    }

    static void apply(Map<String, FeatureExpression> featureExpressionMap, Set<String> selectedFeatures) {
        for (Map.Entry<String, FeatureExpression> entry : featureExpressionMap.entrySet()) {
            String key = entry.getKey();
            if (key.contains("!")) {
                continue;
            }
            entry.getValue().setTruthValue(selectedFeatures.contains(key));
        }
    }
}
