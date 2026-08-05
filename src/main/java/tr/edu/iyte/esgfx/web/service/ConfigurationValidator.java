package tr.edu.iyte.esgfx.web.service;

import java.util.Map;

import org.springframework.stereotype.Service;

import tr.edu.iyte.esgfx.api.LoadedSplModel;
import tr.edu.iyte.esgfx.api.SingleProductTestGenerationAPI;
import tr.edu.iyte.esgfx.api.ValidationResult;

/**
 * Validates a feature selection against a preloaded SPL's feature model by
 * delegating to the engine API.
 */
@Service
public class ConfigurationValidator {

    private final EsgFxModelLoader loader;

    public ConfigurationValidator(EsgFxModelLoader loader) {
        this.loader = loader;
    }

    public ValidationResult validate(String splShortName, Map<String, Boolean> requestedSelection) {
        LoadedSplModel model = loader.load(splShortName);
        Map<String, Boolean> selection =
                FeatureSelectionMapper.completeSelection(model.getFeatureExpressionMap(), requestedSelection);

        return SingleProductTestGenerationAPI.validate(model, selection);
    }
}
