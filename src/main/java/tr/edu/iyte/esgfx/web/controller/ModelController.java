package tr.edu.iyte.esgfx.web.controller;

import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import tr.edu.iyte.esgfx.api.LoadedSplModel;
import tr.edu.iyte.esgfx.api.SingleProductTestGenerationAPI;
import tr.edu.iyte.esgfx.web.service.AllProductsTestGenerator;
import tr.edu.iyte.esgfx.web.service.EsgFxJsonExporter;
import tr.edu.iyte.esgfx.web.service.EsgFxModelLoader;
import tr.edu.iyte.esgfx.web.service.SampledProductsTestGenerator;
import tr.edu.iyte.esgfx.web.service.InvalidModelException;

/**
 * Renders an uploaded model. The response has the same shape as a preloaded
 * example so the page draws either one the same way; only the label mapping is
 * absent, since an uploaded feature model names its own features.
 */
@RestController
@RequestMapping("/api/model")
public class ModelController {

    private final EsgFxModelLoader loader;
    private final EsgFxJsonExporter exporter;

    public ModelController(EsgFxModelLoader loader, EsgFxJsonExporter exporter) {
        this.loader = loader;
        this.exporter = exporter;
    }

    @PostMapping
    public ResponseEntity<?> load(@RequestBody UploadRequest request) throws Exception {
        LoadedSplModel model;
        try {
            model = loader.loadFromContent(request.featureModelXml(), request.esgFxXml());
        } catch (InvalidModelException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }

        Map<String, Object> payload = exporter.export("Uploaded", model);
        payload.put("configurationCount", SingleProductTestGenerationAPI.countValidConfigurations(model));
        payload.put("allProductsLimit", AllProductsTestGenerator.MAX_CONFIGURATIONS);
        payload.put("maxSampleSize", SampledProductsTestGenerator.MAX_SAMPLE_SIZE);

        return ResponseEntity.ok(payload);
    }

    public record UploadRequest(String featureModelXml, String esgFxXml) {
    }
}
