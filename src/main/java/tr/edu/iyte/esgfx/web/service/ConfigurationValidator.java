package tr.edu.iyte.esgfx.web.service;

import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;

import tr.edu.iyte.esgfx.api.LoadedSplModel;
import tr.edu.iyte.esgfx.api.SingleProductTestGenerationAPI;
import tr.edu.iyte.esgfx.api.ValidationResult;

/**
 * Validates a single feature selection against a loaded SPL model by
 * delegating to the engine API.
 */
@Service
public class ConfigurationValidator {

    public ValidationResult validate(LoadedSplModel model, Set<String> selectedFeatures) {
        Map<String, Boolean> selection =
                FeatureSelectionMapper.completeSelection(model.getFeatureExpressionMap(), selectedFeatures);

        return SingleProductTestGenerationAPI.validate(model, selection);
    }
}
