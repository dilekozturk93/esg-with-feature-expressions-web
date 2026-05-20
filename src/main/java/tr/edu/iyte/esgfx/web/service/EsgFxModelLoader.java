package tr.edu.iyte.esgfx.web.service;

import java.io.File;
import java.util.Map;

import org.springframework.stereotype.Service;

import tr.edu.iyte.esg.model.ESG;
import tr.edu.iyte.esgfx.conversion.mxe.MXEFileToESGFxConverter;
import tr.edu.iyte.esgfx.model.featuremodel.FeatureModel;

/**
 * Loads a preloaded ESG-Fx example (feature model + ESG-Fx graph) from the
 * bundled submodule resources. The engine's converter requires the feature
 * model to be parsed before the ESG-Fx, because the latter resolves feature
 * references against the former.
 */
@Service
public class EsgFxModelLoader {

    private static final Map<String, ExampleFiles> EXAMPLES = Map.of(
            "SVM", new ExampleFiles(
                    "lib/esg-core/files/Cases/SodaVendingMachine/SVM_ESGFx.mxe",
                    "lib/esg-core/files/Cases/SodaVendingMachine/configs/model.xml"),
            "eM", new ExampleFiles(
                    "lib/esg-core/files/Cases/eMail/eM_ESGFx.mxe",
                    "lib/esg-core/files/Cases/eMail/configs/model.xml"),
            "El", new ExampleFiles(
                    "lib/esg-core/files/Cases/Elevator/El_ESGFx.mxe",
                    "lib/esg-core/files/Cases/Elevator/configs/model.xml"));

    public EsgFxExample load(String shortName) {
        ExampleFiles files = EXAMPLES.get(shortName);
        if (files == null) {
            throw new IllegalArgumentException("Unknown example: " + shortName);
        }

        String mxePath = requireExisting(files.mxe());
        String modelPath = requireExisting(files.featureModel());

        MXEFileToESGFxConverter converter = new MXEFileToESGFxConverter();
        try {
            FeatureModel featureModel = converter.parseFeatureModel(modelPath);
            ESG esg = converter.parseMXEFileForESGFxCreation(mxePath);
            return new EsgFxExample(shortName, featureModel, esg, converter.getFeatureExpressionMap());
        } catch (Exception e) {
            throw new IllegalStateException("Failed to load example " + shortName, e);
        }
    }

    private static String requireExisting(String relativePath) {
        File file = new File(relativePath);
        if (!file.exists()) {
            throw new IllegalStateException(
                    "Required example file not found: " + file.getAbsolutePath());
        }
        return file.getAbsolutePath();
    }

    private record ExampleFiles(String mxe, String featureModel) {
    }
}
