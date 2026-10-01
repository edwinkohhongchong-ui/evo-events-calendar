// Static config: quick links to each institution's own published academic
// calendar, used by the Seasons "Update Calendar" and "Start a New Year"
// flows. There is no unified API for Singapore school/poly/university exam
// schedules (unlike Holidays, which has Calendarific) — this is a manual
// entry assist, not a live scraper. Edwin reads each institution's current
// calendar himself and types the dates in; these are just quick jump links.
//
// Best-effort landing pages, not guaranteed to be the exact live PDF/page for
// a given year (those change yearly) — that's fine and expected. Edwin can
// update any URL below whenever one goes stale.

export interface SourceInstitution {
  name: string;
  url: string;
}

export interface SourceGroup {
  groupName: string;
  category: "School Schedule" | "Exam Period"; // matches the seasons.category check constraint
  institutions: SourceInstitution[];
}

export const EXAM_SCHEDULE_SOURCES: SourceGroup[] = [
  {
    groupName: "MOE School Terms & Holidays",
    category: "School Schedule",
    institutions: [{ name: "MOE", url: "https://www.moe.gov.sg/calendar" }],
  },
  {
    groupName: "Polytechnic Exams",
    category: "Exam Period",
    institutions: [
      { name: "Ngee Ann Polytechnic", url: "https://www.np.edu.sg/student/campus-life/calendar" },
      { name: "Nanyang Polytechnic", url: "https://www.nyp.edu.sg/student/study/academic-calendar" },
      { name: "Singapore Polytechnic", url: "https://www.sp.edu.sg/sp/student-services/academic-calendar" },
      { name: "Temasek Polytechnic", url: "https://www.tp.edu.sg" },
      { name: "Republic Polytechnic", url: "https://www.rp.edu.sg" },
    ],
  },
  {
    groupName: "University Exams",
    category: "Exam Period",
    institutions: [
      { name: "NUS", url: "https://nus.edu.sg/registrar/calendar" },
      { name: "NTU", url: "https://www.ntu.edu.sg/admissions/academic-calendar" },
      { name: "SMU", url: "https://www.smu.edu.sg/admissions/important-dates" },
      { name: "SIT", url: "https://www.singaporetech.edu.sg" },
      { name: "SUTD", url: "https://www.sutd.edu.sg" },
      { name: "SUSS", url: "https://www.suss.edu.sg" },
    ],
  },
];
