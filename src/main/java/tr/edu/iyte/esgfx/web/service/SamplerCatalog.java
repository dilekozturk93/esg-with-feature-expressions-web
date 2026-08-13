package tr.edu.iyte.esgfx.web.service;

import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import tr.edu.iyte.esgfx.api.ProductConfigurationSampler;
import tr.edu.iyte.esgfx.api.SamplerUnavailableException;
import tr.edu.iyte.esgfx.api.UniGenSampler;
import tr.edu.iyte.esgfx.api.UniformEnumerationSampler;

/**
 * The samplers a request may ask for.
 *
 * <p>Enumeration is always there; UniGen depends on an external tool, so its
 * availability is reported rather than assumed and a request that asks for it
 * without it being installed gets a message saying so.
 */
@Service
public class SamplerCatalog {

    public static final String ENUMERATION = "enumeration";
    public static final String UNIGEN = "unigen";

    private final List<String> uniGenCommand;

    public SamplerCatalog(@Value("${esgfx.unigen.command}") List<String> uniGenCommand) {
        this.uniGenCommand = uniGenCommand;
    }

    public ProductConfigurationSampler samplerFor(String name) {
        if (name == null || name.isBlank() || ENUMERATION.equals(name)) {
            return new UniformEnumerationSampler();
        }
        if (UNIGEN.equals(name)) {
            return new UniGenSampler(uniGenCommand);
        }
        throw new IllegalArgumentException("Unknown sampler: " + name);
    }

    /**
     * Probing starts a process, so the answer is settled once at startup rather
     * than on every request that renders a model.
     */
    private Boolean uniGenAvailable;

    public synchronized boolean isUniGenAvailable() {
        if (uniGenAvailable == null) {
            try {
                uniGenAvailable = new UniGenSampler(uniGenCommand).isAvailable();
            } catch (RuntimeException e) {
                uniGenAvailable = Boolean.FALSE;
            }
        }
        return uniGenAvailable;
    }

    public String uniGenUnavailableMessage() {
        return "UniGen is not available on this server. It is a native tool run through "
                + String.join(" ", uniGenCommand)
                + "; install pyunigen for that interpreter, or sample by enumeration instead.";
    }

    public void requireAvailable(String name) {
        if (UNIGEN.equals(name) && !isUniGenAvailable()) {
            throw new SamplerUnavailableException(uniGenUnavailableMessage());
        }
    }
}
