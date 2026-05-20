package tr.edu.iyte.esgfx.web.controller;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import tr.edu.iyte.esgfx.web.service.InvalidConfigurationException;
import tr.edu.iyte.esgfx.web.service.SingleProductTestGenerator;
import tr.edu.iyte.esgfx.web.service.TestGenerationResult;

@RestController
@RequestMapping("/api/generate")
public class GenerationController {

    private static final long GENERATION_TIMEOUT_SECONDS = 60;

    private final SingleProductTestGenerator generator;

    public GenerationController(SingleProductTestGenerator generator) {
        this.generator = generator;
    }

    @PostMapping
    public ResponseEntity<?> generate(@RequestBody GenerateRequest request) {
        Set<String> features = request.features() == null ? Set.of() : Set.copyOf(request.features());

        CompletableFuture<TestGenerationResult> future = CompletableFuture.supplyAsync(() -> {
            try {
                return generator.generate(request.splName(), features, request.coverageLength());
            } catch (RuntimeException e) {
                throw e;
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        });

        try {
            TestGenerationResult result = future.orTimeout(GENERATION_TIMEOUT_SECONDS, TimeUnit.SECONDS).join();
            return ResponseEntity.ok(result);
        } catch (CompletionException ex) {
            Throwable cause = ex.getCause();
            if (cause instanceof TimeoutException) {
                return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                        .body(Map.of("error", "Generation timed out after " + GENERATION_TIMEOUT_SECONDS + " seconds"));
            }
            if (cause instanceof InvalidConfigurationException invalid) {
                return ResponseEntity.badRequest()
                        .body(Map.of("valid", false, "errors", invalid.getErrors()));
            }
            if (cause instanceof IllegalArgumentException) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", cause.getMessage()));
            }
            throw ex;
        }
    }

    public record GenerateRequest(String splName, Set<String> features, int coverageLength) {
    }
}
