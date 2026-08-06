package tr.edu.iyte.esgfx.web.service;

/** An uploaded model could not be read. Reported to the caller, not logged as a fault. */
public class InvalidModelException extends RuntimeException {

    public InvalidModelException(String message) {
        super(message);
    }
}
