package tr.edu.iyte.esgfx.web.service;

import java.util.Map;

import tr.edu.iyte.esg.model.ESG;
import tr.edu.iyte.esgfx.model.featureexpression.FeatureExpression;
import tr.edu.iyte.esgfx.model.featuremodel.FeatureModel;

public record EsgFxExample(
        String shortName,
        FeatureModel featureModel,
        ESG esg,
        Map<String, FeatureExpression> featureExpressionMap) {
}
