package tr.edu.iyte.esgfx.web.service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import tr.edu.iyte.esgfx.api.InvalidConfigurationException;
import tr.edu.iyte.esgfx.model.featureexpression.FeatureExpression;

/**
 * Expands a requested feature selection into the complete truth-value map the
 * engine API expects. Every feature has to appear: the API only touches the
 * keys it is handed, so an omitted feature would silently keep whatever truth
 * value the model was left in. Negation entries (keys containing '!') are
 * skipped — the engine derives their value from the positive entry.
 */
final class FeatureSelectionMapper {

    private FeatureSelectionMapper() {
    }

    static Map<String, Boolean> completeSelection(Map<String, FeatureExpression> featureExpressionMap,
            Map<String, Boolean> requestedSelection) {

        Map<String, Boolean> selection = new LinkedHashMap<>();
        for (String featureName : featureExpressionMap.keySet()) {
            if (featureName.contains("!")) {
                continue;
            }
            selection.put(featureName, Boolean.TRUE.equals(requestedSelection.get(featureName)));
        }

        List<String> unknownFeatures = new ArrayList<>();
        for (String requestedName : requestedSelection.keySet()) {
            if (!selection.containsKey(requestedName)) {
                unknownFeatures.add(requestedName);
            }
        }
        if (!unknownFeatures.isEmpty()) {
            throw new InvalidConfigurationException(
                    List.of("Unknown feature name(s): " + String.join(", ", unknownFeatures)));
        }

        return selection;
    }
}
