package tr.edu.iyte.esgfx.web.service;

import java.util.List;

public class InvalidConfigurationException extends RuntimeException {

    private final List<String> errors;

    public InvalidConfigurationException(List<String> errors) {
        super(String.join("; ", errors));
        this.errors = errors;
    }

    public List<String> getErrors() {
        return errors;
    }
}
