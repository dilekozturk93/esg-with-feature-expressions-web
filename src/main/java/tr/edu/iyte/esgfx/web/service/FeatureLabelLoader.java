package tr.edu.iyte.esgfx.web.service;

import java.io.IOException;
import java.io.InputStream;
import java.util.Map;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Loads a static SPL → (feature short code → display label) mapping bundled
 * as {@code feature-labels.json}. The engine's feature models use short codes
 * for SVM and e-Mail; this loader provides the human-readable labels for the
 * UI without round-tripping through the engine.
 */
@Service
public class FeatureLabelLoader {

    private static final String RESOURCE_PATH = "feature-labels.json";

    private final Map<String, Map<String, String>> labelsBySpl;

    public FeatureLabelLoader() {
        try (InputStream in = new ClassPathResource(RESOURCE_PATH,
                FeatureLabelLoader.class.getClassLoader()).getInputStream()) {
            this.labelsBySpl = new ObjectMapper().readValue(
                    in, new TypeReference<Map<String, Map<String, String>>>() {});
        } catch (IOException e) {
            throw new IllegalStateException("Failed to load " + RESOURCE_PATH, e);
        }
    }

    public Map<String, String> labelsFor(String splShortName) {
        return labelsBySpl.getOrDefault(splShortName, Map.of());
    }
}
