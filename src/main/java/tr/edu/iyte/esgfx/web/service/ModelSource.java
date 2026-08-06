package tr.edu.iyte.esgfx.web.service;

/**
 * Where a request's models come from: a bundled example named by its short
 * name, or the file contents themselves. Requests carry the content rather than
 * a server-side handle so that nothing has to survive between them.
 */
public record ModelSource(String splName, String featureModelXml, String esgFxXml) {

    public boolean isUpload() {
        return splName == null || splName.isBlank();
    }

    /** A label for the source, used where a preloaded example would show its short name. */
    public String displayName() {
        return isUpload() ? "Uploaded" : splName;
    }
}
