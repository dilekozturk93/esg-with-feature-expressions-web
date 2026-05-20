package tr.edu.iyte.esgfx.web.service;

import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Service;

import tr.edu.iyte.esgfx.productconfigurationgeneration.ProductConfigurationValidator;

/**
 * Validates a single feature selection against an example's feature model.
 * Applies the selection to the example's feature-expression map and delegates
 * to the engine's {@link ProductConfigurationValidator}.
 */
@Service
public class ConfigurationValidator {

    public ValidationResult validate(EsgFxExample example, Set<String> selectedFeatures) {
        FeatureSelectionApplier.apply(example.featureExpressionMap(), selectedFeatures);

        boolean valid = new ProductConfigurationValidator()
                .validate(example.featureModel(), example.featureExpressionMap());

        if (valid) {
            return new ValidationResult(true, List.of());
        }
        return new ValidationResult(false,
                List.of("Configuration violates feature model constraints."));
    }

    public record ValidationResult(boolean valid, List<String> errors) {
    }
}
