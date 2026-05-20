package tr.edu.iyte.esgfx.web.service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import tr.edu.iyte.esg.model.ESG;
import tr.edu.iyte.esg.model.Edge;
import tr.edu.iyte.esg.model.Vertex;
import tr.edu.iyte.esgfx.model.VertexRefinedByFeatureExpression;
import tr.edu.iyte.esgfx.model.featuremodel.Feature;
import tr.edu.iyte.esgfx.model.featuremodel.FeatureModel;

/**
 * Serializes an {@link EsgFxExample} into a Cytoscape.js-compatible JSON
 * shape with two top-level sections, {@code esgFx} and {@code featureModel}.
 * Feature-expression annotations live on ESG-Fx vertices in the engine
 * model, so they appear on node data, not on edge data.
 */
@Service
public class EsgFxJsonExporter {

    private final FeatureLabelLoader featureLabelLoader;

    public EsgFxJsonExporter(FeatureLabelLoader featureLabelLoader) {
        this.featureLabelLoader = featureLabelLoader;
    }

    public Map<String, Object> export(EsgFxExample example) {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("name", example.shortName());
        root.put("esgFx", exportEsgFx(example.esg()));
        root.put("featureModel", exportFeatureModel(example.featureModel()));
        root.put("featureLabels", featureLabelLoader.labelsFor(example.shortName()));
        return root;
    }

    private Map<String, Object> exportEsgFx(ESG esg) {
        List<Map<String, Object>> nodes = new ArrayList<>();
        for (Vertex vertex : esg.getVertexList()) {
            Map<String, Object> nodeData = new LinkedHashMap<>();
            nodeData.put("id", vertexId(vertex));
            nodeData.put("label", vertex.getEvent().getName());
            nodeData.put("featureExpression", featureExpressionOf(vertex));
            nodeData.put("isPseudoStart", vertex.isPseudoStartVertex());
            nodeData.put("isPseudoEnd", vertex.isPseudoEndVertex());
            nodes.add(Map.of("data", nodeData));
        }

        List<Map<String, Object>> edges = new ArrayList<>();
        for (Edge edge : esg.getEdgeList()) {
            Map<String, Object> edgeData = new LinkedHashMap<>();
            edgeData.put("id", "e" + edge.getID());
            edgeData.put("source", vertexId(edge.getSource()));
            edgeData.put("target", vertexId(edge.getTarget()));
            edges.add(Map.of("data", edgeData));
        }

        Map<String, Object> esgFx = new LinkedHashMap<>();
        esgFx.put("nodes", nodes);
        esgFx.put("edges", edges);
        return esgFx;
    }

    private String vertexId(Vertex vertex) {
        return "v" + vertex.getID();
    }

    private String featureExpressionOf(Vertex vertex) {
        if (vertex.isPseudoStartVertex() || vertex.isPseudoEndVertex()) {
            return null;
        }
        if (vertex instanceof VertexRefinedByFeatureExpression refined
                && refined.getFeatureExpression() != null) {
            return refined.getFeatureExpression().toString();
        }
        return null;
    }

    private Map<String, Object> exportFeatureModel(FeatureModel model) {
        List<Map<String, Object>> nodes = new ArrayList<>();
        List<Map<String, Object>> edges = new ArrayList<>();

        Feature root = model.getRoot();
        nodes.add(featureNode(root, "root"));
        appendChildren(model, root, nodes, edges);

        Map<String, Object> featureModel = new LinkedHashMap<>();
        featureModel.put("nodes", nodes);
        featureModel.put("edges", edges);
        return featureModel;
    }

    private void appendChildren(FeatureModel model, Feature parent,
            List<Map<String, Object>> nodes, List<Map<String, Object>> edges) {

        for (Feature child : model.getChildANDFeatures(parent)) {
            String type = child.isMandatory() ? "mandatory" : "optional";
            nodes.add(featureNode(child, type));
            edges.add(featureEdge(parent, child));
            appendChildren(model, child, nodes, edges);
        }
        for (Feature child : model.getChildORFeatures(parent)) {
            nodes.add(featureNode(child, "or"));
            edges.add(featureEdge(parent, child));
            appendChildren(model, child, nodes, edges);
        }
        for (Feature child : model.getChildXORFeatures(parent)) {
            nodes.add(featureNode(child, "alternative"));
            edges.add(featureEdge(parent, child));
            appendChildren(model, child, nodes, edges);
        }
    }

    private Map<String, Object> featureNode(Feature feature, String type) {
        Map<String, Object> nodeData = new LinkedHashMap<>();
        nodeData.put("id", feature.getName());
        nodeData.put("label", feature.getName());
        nodeData.put("type", type);
        nodeData.put("isAbstract", feature.isAbstract());
        return Map.of("data", nodeData);
    }

    private Map<String, Object> featureEdge(Feature parent, Feature child) {
        Map<String, Object> edgeData = new LinkedHashMap<>();
        edgeData.put("id", parent.getName() + "->" + child.getName());
        edgeData.put("source", parent.getName());
        edgeData.put("target", child.getName());
        return Map.of("data", edgeData);
    }
}
