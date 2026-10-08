package tr.edu.iyte.esgfx.web.service;

import java.io.StringReader;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;

import org.springframework.stereotype.Service;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.xml.sax.InputSource;

import tr.edu.iyte.esg.model.ESG;
import tr.edu.iyte.esg.model.Edge;
import tr.edu.iyte.esg.model.Vertex;
import tr.edu.iyte.esgfx.api.LoadedSplModel;
import tr.edu.iyte.esgfx.model.VertexRefinedByFeatureExpression;
import tr.edu.iyte.esgfx.model.featuremodel.Feature;
import tr.edu.iyte.esgfx.model.featuremodel.FeatureModel;

/**
 * Serializes a {@link LoadedSplModel} into a Cytoscape.js-compatible JSON
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

    public Map<String, Object> export(String splShortName, LoadedSplModel model, String featureModelXml) {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("name", splShortName);
        root.put("esgFx", exportEsgFx(model.getEsgFx()));
        Map<String, Object> featureModelFromXml = featureModelFromXml(featureModelXml);
        root.put("featureModel", featureModelFromXml != null
                ? featureModelFromXml
                : exportFeatureModel(model.getFeatureModel()));
        root.put("features", selectableFeatures(model));
        root.put("featureLabels", featureLabelLoader.labelsFor(splShortName));
        return root;
    }

    /**
     * The feature names a configuration is expressed in. These are the keys the
     * generation API expects, which is not the same as the feature model's
     * nodes — abstract features have no truth value of their own.
     */
    private List<String> selectableFeatures(LoadedSplModel model) {
        List<String> features = new ArrayList<>();
        for (String featureName : model.getFeatureExpressionMap().keySet()) {
            if (!featureName.contains("!")) {
                features.add(featureName);
            }
        }
        return features;
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

    /**
     * The feature tree as the feature model file states it, or null when the
     * file cannot be read (the engine's group lists are used then).
     *
     * The engine's parser is enough for analysis but not for drawing the tree:
     * features that follow a nested {@code <and>} are left out of every child
     * list (syngo.via's as, clop, ab, ser, layg, sp, iar, pat and vi), and a
     * concrete {@code <alt>} or {@code <or>} feature is filed under its
     * parent's group (syngo.via's mandatory Workflow came out as an
     * alternative). The editor rebuilds the model from this tree, so a
     * missing feature made its round trip fail. In FeatureIDE the group kind
     * belongs to the parent element: the children of an {@code <alt>} are
     * alternatives, those of an {@code <or>} an or-group, and those of an
     * {@code <and>} mandatory or optional.
     */
    private Map<String, Object> featureModelFromXml(String featureModelXml) {
        if (featureModelXml == null || featureModelXml.isBlank()) {
            return null;
        }
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            factory.setExpandEntityReferences(false);
            Element document = factory.newDocumentBuilder()
                    .parse(new InputSource(new StringReader(featureModelXml))).getDocumentElement();
            Node struct = document.getElementsByTagName("struct").item(0);
            Element root = struct == null ? null : firstFeatureElement((Element) struct);
            if (root == null || root.getAttribute("name").isEmpty()) {
                return null;
            }
            List<Map<String, Object>> nodes = new ArrayList<>();
            List<Map<String, Object>> edges = new ArrayList<>();
            nodes.add(xmlFeatureNode(root, "root"));
            appendXmlChildren(root, nodes, edges);

            Map<String, Object> featureModel = new LinkedHashMap<>();
            featureModel.put("nodes", nodes);
            featureModel.put("edges", edges);
            return featureModel;
        } catch (Exception e) {
            return null;
        }
    }

    private void appendXmlChildren(Element parent, List<Map<String, Object>> nodes,
            List<Map<String, Object>> edges) {
        String group = parent.getTagName().toLowerCase();
        String parentName = parent.getAttribute("name");
        for (Node node = parent.getFirstChild(); node != null; node = node.getNextSibling()) {
            if (!(node instanceof Element child) || !isFeatureElement(child)) {
                continue;
            }
            String name = child.getAttribute("name");
            if (name.isEmpty()) {
                continue;
            }
            String type = group.equals("alt") ? "alternative"
                    : group.equals("or") ? "or"
                    : Boolean.parseBoolean(child.getAttribute("mandatory")) ? "mandatory" : "optional";
            nodes.add(xmlFeatureNode(child, type));
            Map<String, Object> edgeData = new LinkedHashMap<>();
            edgeData.put("id", parentName + "->" + name);
            edgeData.put("source", parentName);
            edgeData.put("target", name);
            edges.add(Map.of("data", edgeData));
            appendXmlChildren(child, nodes, edges);
        }
    }

    private Map<String, Object> xmlFeatureNode(Element element, String type) {
        Map<String, Object> nodeData = new LinkedHashMap<>();
        nodeData.put("id", element.getAttribute("name"));
        nodeData.put("label", element.getAttribute("name"));
        nodeData.put("type", type);
        nodeData.put("isAbstract", Boolean.parseBoolean(element.getAttribute("abstract")));
        return Map.of("data", nodeData);
    }

    private Element firstFeatureElement(Element parent) {
        for (Node node = parent.getFirstChild(); node != null; node = node.getNextSibling()) {
            if (node instanceof Element child && isFeatureElement(child)) {
                return child;
            }
        }
        return null;
    }

    private boolean isFeatureElement(Element element) {
        String tag = element.getTagName().toLowerCase();
        return tag.equals("feature") || tag.equals("and") || tag.equals("or") || tag.equals("alt");
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
