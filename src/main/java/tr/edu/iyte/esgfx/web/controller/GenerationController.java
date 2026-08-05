package tr.edu.iyte.esgfx.web.controller;

import java.util.List;
import java.util.Map;
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

import tr.edu.iyte.esgfx.api.InvalidConfigurationException;
import tr.edu.iyte.esgfx.web.service.AllProductsTestGenerator;
import tr.edu.iyte.esgfx.web.service.MultiProductTestGenerator;
import tr.edu.iyte.esgfx.web.service.SingleProductTestGenerator;
import tr.edu.iyte.esgfx.web.service.TestGenerationResult;
import tr.edu.iyte.esgfx.web.service.TooManyConfigurationsException;

@RestController
@RequestMapping("/api/generate")
public class GenerationController {

    private static final long GENERATION_TIMEOUT_SECONDS = 60;

    /** Every product of a bundled example takes far longer than one. */
    private static final long ALL_PRODUCTS_TIMEOUT_SECONDS = 300;

    private static final int DEFAULT_PRODUCT_ID = 1;

    private final SingleProductTestGenerator generator;
    private final MultiProductTestGenerator multiProductGenerator;
    private final AllProductsTestGenerator allProductsGenerator;

    public GenerationController(SingleProductTestGenerator generator,
            MultiProductTestGenerator multiProductGenerator,
            AllProductsTestGenerator allProductsGenerator) {
        this.generator = generator;
        this.multiProductGenerator = multiProductGenerator;
        this.allProductsGenerator = allProductsGenerator;
    }

    @PostMapping
    public ResponseEntity<?> generate(@RequestBody GenerateRequest request) {
        Map<String, Boolean> featureSelection =
                request.featureSelection() == null ? Map.of() : request.featureSelection();
        int productId = request.productId() == null ? DEFAULT_PRODUCT_ID : request.productId();

        CompletableFuture<TestGenerationResult> future = CompletableFuture.supplyAsync(() -> {
            try {
                return generator.generate(request.splName(), featureSelection, productId,
                        request.coverageLength());
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

    @PostMapping("/multi")
    public ResponseEntity<?> generateMulti(@RequestBody GenerateMultiRequest request) {
        List<Map<String, Boolean>> selections =
                request.products() == null ? List.of() : request.products();

        CompletableFuture<List<TestGenerationResult>> future = CompletableFuture.supplyAsync(() -> {
            try {
                return multiProductGenerator.generate(request.splName(), selections, request.coverageLength());
            } catch (RuntimeException e) {
                throw e;
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        });

        try {
            List<TestGenerationResult> results =
                    future.orTimeout(ALL_PRODUCTS_TIMEOUT_SECONDS, TimeUnit.SECONDS).join();
            return ResponseEntity.ok(Map.of("products", results));
        } catch (CompletionException ex) {
            Throwable cause = ex.getCause();
            if (cause instanceof TimeoutException) {
                return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of(
                        "error", "Generation timed out after " + ALL_PRODUCTS_TIMEOUT_SECONDS + " seconds"));
            }
            if (cause instanceof InvalidConfigurationException invalid) {
                return ResponseEntity.badRequest()
                        .body(Map.of("valid", false, "errors", invalid.getErrors()));
            }
            if (cause instanceof IllegalArgumentException) {
                return ResponseEntity.badRequest().body(Map.of("error", cause.getMessage()));
            }
            throw ex;
        }
    }

    @PostMapping("/all")
    public ResponseEntity<?> generateAll(@RequestBody GenerateAllRequest request) {
        CompletableFuture<List<TestGenerationResult>> future = CompletableFuture.supplyAsync(() -> {
            try {
                return allProductsGenerator.generate(request.splName(), request.coverageLength());
            } catch (RuntimeException e) {
                throw e;
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        });

        try {
            List<TestGenerationResult> results =
                    future.orTimeout(ALL_PRODUCTS_TIMEOUT_SECONDS, TimeUnit.SECONDS).join();
            return ResponseEntity.ok(Map.of("products", results));
        } catch (CompletionException ex) {
            Throwable cause = ex.getCause();
            if (cause instanceof TimeoutException) {
                return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of(
                        "error", "Generation timed out after " + ALL_PRODUCTS_TIMEOUT_SECONDS + " seconds"));
            }
            if (cause instanceof TooManyConfigurationsException tooMany) {
                return ResponseEntity.badRequest().body(Map.of(
                        "error", tooMany.getMessage(),
                        "configurationCount", tooMany.getConfigurationCount(),
                        "limit", tooMany.getLimit()));
            }
            if (cause instanceof IllegalArgumentException) {
                return ResponseEntity.badRequest().body(Map.of("error", cause.getMessage()));
            }
            throw ex;
        }
    }

    /**
     * {@code featureSelection} maps engine-level feature names to truth values.
     * {@code productId} is optional and only labels the result, so that a
     * multi-product UI can match responses to the products the user ordered.
     */
    public record GenerateRequest(String splName, Map<String, Boolean> featureSelection,
            int coverageLength, Integer productId) {
    }

    /** {@code products} is ordered; results come back numbered by that order. */
    public record GenerateMultiRequest(String splName, List<Map<String, Boolean>> products,
            int coverageLength) {
    }

    public record GenerateAllRequest(String splName, int coverageLength) {
    }
}
