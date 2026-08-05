package tr.edu.iyte.esgfx.web.service;

public class TooManyConfigurationsException extends RuntimeException {

    private final long configurationCount;
    private final long limit;

    public TooManyConfigurationsException(long configurationCount, long limit) {
        super("This feature model has " + configurationCount + " valid configurations, above the "
                + limit + " the all-products mode allows. Generate for specific products instead.");
        this.configurationCount = configurationCount;
        this.limit = limit;
    }

    public long getConfigurationCount() {
        return configurationCount;
    }

    public long getLimit() {
        return limit;
    }
}
