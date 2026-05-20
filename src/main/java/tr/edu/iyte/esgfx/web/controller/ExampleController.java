package tr.edu.iyte.esgfx.web.controller;

import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import tr.edu.iyte.esgfx.web.service.EsgFxJsonExporter;
import tr.edu.iyte.esgfx.web.service.EsgFxModelLoader;

@RestController
@RequestMapping("/api/example")
public class ExampleController {

    private final EsgFxModelLoader loader;
    private final EsgFxJsonExporter exporter;

    public ExampleController(EsgFxModelLoader loader, EsgFxJsonExporter exporter) {
        this.loader = loader;
        this.exporter = exporter;
    }

    @GetMapping("/svm")
    public Map<String, Object> svm() {
        return exporter.export(loader.load("SVM"));
    }
}
