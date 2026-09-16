package tr.edu.iyte.esgfx.web.service;

/**
 * All-products was asked for a model too large to answer in one response. The
 * bound is on the feature count, since the number of products grows with it.
 */
public class TooManyConfigurationsException extends RuntimeException {

    private final long count;
    private final long limit;

    public TooManyConfigurationsException(String message, long count, long limit) {
        super(message);
        this.count = count;
        this.limit = limit;
    }

    public long getConfigurationCount() {
        return count;
    }

    public long getLimit() {
        return limit;
    }
}
