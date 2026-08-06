package tr.edu.iyte.esgfx.web.service;

import org.springframework.stereotype.Service;

import tr.edu.iyte.esgfx.api.LoadedSplModel;

/** Turns a request's {@link ModelSource} into a loaded model. */
@Service
public class SplModelResolver {

    private final EsgFxModelLoader loader;

    public SplModelResolver(EsgFxModelLoader loader) {
        this.loader = loader;
    }

    public LoadedSplModel resolve(ModelSource source) {
        if (source == null) {
            throw new IllegalArgumentException("A preloaded example or an uploaded model is required");
        }
        return source.isUpload()
                ? loader.loadFromContent(source.featureModelXml(), source.esgFxXml())
                : loader.load(source.splName());
    }
}
