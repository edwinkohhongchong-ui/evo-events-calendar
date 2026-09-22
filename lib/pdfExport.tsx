import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { EventOccurrence } from "./types";
import { formatDateDisplay, formatEventTimeRange } from "./dates";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10 },
  title: { fontSize: 16, marginBottom: 2, fontWeight: 700 },
  subtitle: { fontSize: 10, color: "#666666", marginBottom: 18 },
  headerRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#1F2A44",
    paddingBottom: 4,
    marginBottom: 2,
  },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e5e5e5", paddingVertical: 5 },
  headerCell: { fontSize: 9, fontWeight: 700, color: "#1F2A44" },
  date: { width: 80 },
  time: { width: 90 },
  name: { flex: 1 },
  level: { width: 90, color: "#666666" },
  empty: { marginTop: 16, color: "#666666" },
});

// A flat, dated table — deliberately plain (no per-level color) since a
// printed/exported lineup doesn't need the calendar's visual color coding
// to stay legible, and colored text can render poorly on some PDF viewers'
// default print settings.
export async function renderEventLineupPdf(
  occurrences: EventOccurrence[],
  range: { startDate: string; endDate: string }
): Promise<Buffer> {
  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>+EVO Events Calendar — Event Lineup</Text>
        <Text style={styles.subtitle}>
          {formatDateDisplay(range.startDate)} – {formatDateDisplay(range.endDate)}
        </Text>
        <View style={styles.headerRow}>
          <Text style={[styles.headerCell, styles.date]}>Date</Text>
          <Text style={[styles.headerCell, styles.time]}>Time</Text>
          <Text style={[styles.headerCell, styles.name]}>Event</Text>
          <Text style={[styles.headerCell, styles.level]}>Category</Text>
        </View>
        {occurrences.map((occ) => (
          <View key={`${occ.event.id}-${occ.occurrenceDate}`} style={styles.row} wrap={false}>
            <Text style={styles.date}>{formatDateDisplay(occ.occurrenceDate)}</Text>
            <Text style={styles.time}>{formatEventTimeRange(occ.startTime, occ.endTime) ?? "—"}</Text>
            <Text style={styles.name}>{occ.event.name}</Text>
            <Text style={styles.level}>{occ.event.level}</Text>
          </View>
        ))}
        {occurrences.length === 0 && (
          <Text style={styles.empty}>No events match this date range and category selection.</Text>
        )}
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
