package tr.edu.iyte.esgfx.web.service;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

import tr.edu.iyte.esgfx.model.featureexpression.FeatureExpression;

/**
 * Expands a user's set of selected features into the complete truth-value map
 * the engine API expects. Every feature has to appear: the API only touches the
 * keys it is handed, so an omitted feature would silently keep whatever truth
 * value an earlier generation left on it. Negation entries (keys containing
 * '!') are skipped — the engine derives their value from the positive entry.
 */
final class FeatureSelectionMapper {

    private FeatureSelectionMapper() {
    }

    static Map<String, Boolean> completeSelection(Map<String, FeatureExpression> featureExpressionMap,
            Set<String> selectedFeatures) {

        Map<String, Boolean> selection = new LinkedHashMap<>();
        for (String featureName : featureExpressionMap.keySet()) {
            if (featureName.contains("!")) {
                continue;
            }
            selection.put(featureName, selectedFeatures.contains(featureName));
        }
        return selection;
    }
}
