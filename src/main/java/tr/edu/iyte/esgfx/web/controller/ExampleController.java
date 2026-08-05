package tr.edu.iyte.esgfx.web.controller;

import java.util.Locale;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import tr.edu.iyte.esgfx.api.LoadedSplModel;
import tr.edu.iyte.esgfx.api.SingleProductTestGenerationAPI;
import tr.edu.iyte.esgfx.web.service.EsgFxJsonExporter;
import tr.edu.iyte.esgfx.web.service.EsgFxModelLoader;

@RestController
@RequestMapping("/api/example")
public class ExampleController {

    /** URL segment to the short name the engine's file naming uses. */
    private static final Map<String, String> SHORT_NAMES = Map.of(
            "svm", "SVM",
            "em", "eM",
            "el", "El");

    private final EsgFxModelLoader loader;
    private final EsgFxJsonExporter exporter;

    public ExampleController(EsgFxModelLoader loader, EsgFxJsonExporter exporter) {
        this.loader = loader;
        this.exporter = exporter;
    }

    @GetMapping("/{name}")
    public ResponseEntity<?> example(@PathVariable String name) throws Exception {
        String shortName = SHORT_NAMES.get(name.toLowerCase(Locale.ROOT));
        if (shortName == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Unknown example: " + name));
        }

        LoadedSplModel model = loader.load(shortName);
        Map<String, Object> payload = exporter.export(shortName, model);
        payload.put("configurationCount", SingleProductTestGenerationAPI.countValidConfigurations(model));

        return ResponseEntity.ok(payload);
    }
}
