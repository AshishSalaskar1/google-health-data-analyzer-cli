import { jsPDF } from "jspdf";
import type { CoachChart, CoachMessage, CoachProfile, WeeklyPlan } from "./models";

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 17;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function plainText(value: string): string {
  return value.replace(/^#{1,3}\s+/gm, "").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/^[-*]\s+/gm, "• ");
}

function drawChart(pdf: jsPDF, chart: CoachChart, y: number, nextPage: () => number): number {
  const height = 57;
  if (y + height > PAGE_HEIGHT - MARGIN) y = nextPage();
  pdf.setFillColor(247, 249, 250);
  pdf.setDrawColor(220, 229, 234);
  pdf.roundedRect(MARGIN, y, CONTENT_WIDTH, height, 3, 3, "FD");
  pdf.setTextColor(23, 107, 100);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text(chart.title, MARGIN + 5, y + 7);
  pdf.setTextColor(100, 115, 129);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.text(chart.subtitle, MARGIN + 5, y + 12);
  const plot = { x: MARGIN + 8, y: y + 17, width: CONTENT_WIDTH - 16, height: 29 };
  const series = chart.series[0];
  const values = series ? chart.points.map((point) => point.values[series.key]).filter(Number.isFinite) : [];
  if (!series || values.length < 2) return y + height + 5;
  const min = Math.min(0, ...values);
  const max = Math.max(...values, min + 1);
  const x = (index: number) => plot.x + index / Math.max(1, values.length - 1) * plot.width;
  const valueY = (value: number) => plot.y + plot.height - (value - min) / (max - min) * plot.height;
  pdf.setDrawColor(220, 229, 234);
  pdf.line(plot.x, plot.y + plot.height, plot.x + plot.width, plot.y + plot.height);
  if (chart.type === "bar") {
    const barWidth = Math.max(2, Math.min(10, plot.width / values.length * .55));
    pdf.setFillColor(121, 87, 165);
    values.forEach((value, index) => pdf.roundedRect(x(index) - barWidth / 2, valueY(value), barWidth, plot.y + plot.height - valueY(value), 1, 1, "F"));
  } else {
    pdf.setDrawColor(22, 132, 119);
    pdf.setLineWidth(.7);
    values.slice(1).forEach((value, index) => pdf.line(x(index), valueY(values[index]), x(index + 1), valueY(value)));
  }
  pdf.setTextColor(100, 115, 129);
  pdf.setFontSize(6.5);
  chart.points.forEach((point, index) => {
    if (index === 0 || index === chart.points.length - 1 || chart.points.length <= 7) pdf.text(point.label.slice(5), x(index), plot.y + plot.height + 5, { align: "center" });
  });
  pdf.text(`${Math.round(max * 10) / 10}${series.unit}`, plot.x, plot.y + 2);
  return y + height + 5;
}

export function exportChatPdf(messages: CoachMessage[], profile: CoachProfile, weeklyPlan?: WeeklyPlan): void {
  if (!messages.length) return;
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  let y = MARGIN;
  const nextPage = () => { pdf.addPage(); return MARGIN; };
  const ensure = (height: number) => { if (y + height > PAGE_HEIGHT - MARGIN) y = nextPage(); };

  pdf.setFillColor(23, 107, 100);
  pdf.rect(0, 0, PAGE_WIDTH, 33, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(19);
  pdf.text("Health Coach Conversation", MARGIN, 17);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.text(`Exported ${new Date().toLocaleString()}${profile.name ? ` for ${profile.name}` : ""}`, MARGIN, 24);
  y = 43;
  pdf.setTextColor(100, 115, 129);
  pdf.setFontSize(8);
  pdf.text("Personalized wellness information, not medical diagnosis or emergency care.", MARGIN, y);
  y += 9;

  messages.forEach((message) => {
    const isUser = message.role === "user";
    const lines = pdf.splitTextToSize(plainText(message.content), isUser ? CONTENT_WIDTH - 35 : CONTENT_WIDTH - 12) as string[];
    const blockHeight = Math.max(14, lines.length * 4.7 + 12);
    ensure(Math.min(blockHeight, PAGE_HEIGHT - MARGIN * 2));
    if (isUser) { pdf.setFillColor(224, 240, 235); pdf.setDrawColor(184, 218, 208); }
    else { pdf.setFillColor(248, 250, 251); pdf.setDrawColor(220, 229, 234); }
    const width = isUser ? CONTENT_WIDTH - 30 : CONTENT_WIDTH;
    const x = isUser ? MARGIN + 30 : MARGIN;
    pdf.roundedRect(x, y, width, blockHeight, 3, 3, "FD");
    pdf.setTextColor(isUser ? 23 : 23, isUser ? 107 : 35, isUser ? 100 : 45);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    pdf.text(isUser ? "YOU" : "HEALTH COACH", x + 5, y + 6);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(lines, x + 5, y + 12, { lineHeightFactor: 1.35 });
    y += blockHeight + 4;
    if (message.chart) y = drawChart(pdf, message.chart, y, nextPage);
    if (message.evidence?.length) {
      ensure(12);
      pdf.setTextColor(100, 115, 129);
      pdf.setFontSize(7);
      const citations = message.evidence.map((item) => `${item.id}: ${item.title} (${item.source})${item.url ? ` ${item.url}` : ""}`);
      const citationLines = pdf.splitTextToSize(citations.join("  |  "), CONTENT_WIDTH) as string[];
      pdf.text(citationLines, MARGIN, y);
      y += citationLines.length * 3.4 + 5;
    }
  });

  if (weeklyPlan) {
    ensure(35);
    pdf.setTextColor(23, 35, 45);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text(weeklyPlan.title, MARGIN, y + 4);
    y += 10;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    weeklyPlan.items.forEach((item) => { ensure(11); pdf.text(`${item.day} · ${item.focus}: ${item.action} (${item.target})`, MARGIN, y); y += 6; });
  }

  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    pdf.setTextColor(140, 150, 158);
    pdf.setFontSize(7);
    pdf.text(`Health Connect Studio · ${page} / ${pages}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 8, { align: "right" });
  }
  pdf.save(`health-coach-chat-${new Date().toISOString().slice(0, 10)}.pdf`);
}
