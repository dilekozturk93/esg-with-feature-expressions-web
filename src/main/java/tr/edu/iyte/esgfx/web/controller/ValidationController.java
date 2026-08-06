package tr.edu.iyte.esgfx.web.controller;

import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import tr.edu.iyte.esgfx.api.InvalidConfigurationException;
import tr.edu.iyte.esgfx.api.ValidationResult;
import tr.edu.iyte.esgfx.web.service.ConfigurationValidator;
import tr.edu.iyte.esgfx.web.service.InvalidModelException;
import tr.edu.iyte.esgfx.web.service.ModelSource;

@RestController
@RequestMapping("/api/config")
public class ValidationController {

    private final ConfigurationValidator configurationValidator;

    public ValidationController(ConfigurationValidator configurationValidator) {
        this.configurationValidator = configurationValidator;
    }

    @PostMapping("/validate")
    public ResponseEntity<?> validate(@RequestBody ValidateRequest request) {
        Map<String, Boolean> featureSelection =
                request.featureSelection() == null ? Map.of() : request.featureSelection();
        try {
            ValidationResult result = configurationValidator.validate(request.toModelSource(), featureSelection);
            return ResponseEntity.ok(Map.of("valid", result.isValid(), "errors", result.getErrors()));
        } catch (InvalidConfigurationException invalid) {
            return ResponseEntity.badRequest()
                    .body(Map.of("valid", false, "errors", invalid.getErrors()));
        } catch (InvalidModelException invalidModel) {
            return ResponseEntity.badRequest().body(Map.of("error", invalidModel.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /** Either {@code splName} names a bundled example, or the two model files are supplied inline. */
    public record ValidateRequest(String splName, String featureModelXml, String esgFxXml,
            Map<String, Boolean> featureSelection) {

        ModelSource toModelSource() {
            return new ModelSource(splName, featureModelXml, esgFxXml);
        }
    }
}
