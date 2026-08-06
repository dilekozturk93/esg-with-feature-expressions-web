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

    private final SplModelResolver resolver;

    public ConfigurationValidator(SplModelResolver resolver) {
        this.resolver = resolver;
    }

    public ValidationResult validate(ModelSource source, Map<String, Boolean> requestedSelection) {
        LoadedSplModel model = resolver.resolve(source);
        Map<String, Boolean> selection =
                FeatureSelectionMapper.completeSelection(model.getFeatureExpressionMap(), requestedSelection);

        return SingleProductTestGenerationAPI.validate(model, selection);
    }
}
