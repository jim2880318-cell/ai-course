import { createTeachingPptxBlob } from "./pptx-v15.js";

(function initializeCourseWorkbench() {
  if (window.__AI_COURSE_WORKBENCH_INITIALIZED__) return;
  window.__AI_COURSE_WORKBENCH_INITIALIZED__ = true;

const STORAGE_KEY = "ai-course-workbench:v1";
const PHASES = [
  { title: "需求分析", short: "需求", sub: "目标与边界", detail: "澄清培训对象、业务问题、学习结果与课程边界。" },
  { title: "课程大纲", short: "大纲", sub: "模块与时间", detail: "组织模块顺序、教学活动、学习评价和课程时间。" },
  { title: "模块内容母版", short: "内容", sub: "逐模块设计", detail: "逐模块确认知识、案例、练习、答案和讲师引导。" },
  { title: "课程材料", short: "材料", sub: "四类教学材料", detail: "从同一份母版生成授课级 PPTX、学员手册、讲师手册和 Handout。" },
  { title: "质量验收", short: "验收", sub: "问题与交付", detail: "记录证据、修复缺陷、回归验证并确认交付。" },
];
const MATERIAL_TYPES = [
  { id: "ppt", label: "授课级 PPTX", short: "授课 PPT" },
  { id: "learner", label: "学员手册", short: "学员手册" },
  { id: "instructor", label: "讲师手册", short: "讲师手册" },
  { id: "handout", label: "课后 Handout", short: "Handout" },
];
const QA_CHECKS = [
  "已将材料与确认过的大纲和教学内容母版逐项核对",
  "已核对案例事实、练习答案、ROPES 时间轴及四类材料一致性",
  "已在 PowerPoint/WPS 中检查 PPTX 页面、演讲者备注和投屏效果",
  "已确认 PPTX、学员手册、讲师手册和 Handout 可打开且版本对应",
];
const query = (selector, root = document) => root.querySelector(selector);
const queryAll = (selector, root = document) => [...root.querySelectorAll(selector)];
const appMain = query("#appMain");
const modalHost = query("#modalHost");
const toastNode = query("#toast");

function emptyState() {
  return { projects: [], activeId: null, view: "home", stage: 0, selectedModule: "", materialType: "ppt", auditModule: "", pptSlideIndex: 0 };
}
function loadState() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (data && Array.isArray(data.projects)) return { ...emptyState(), ...data, view: "home" };
  } catch {}
  return emptyState();
}
let state = loadState();
let busy = false;
let generationError = null;
let toastTimer;

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch { showToast("本地存储空间不足，请先导出项目备份。"); }
  renderSidebar();
  updateTopbar();
}
function activeProject() { return state.projects.find((p) => p.id === state.activeId) || null; }
function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
function makeId() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
function minutesLabel(value) {
  const n = Math.max(0, Number(value) || 0);
  if (n < 60) return `${n} 分钟`;
  const h = Math.floor(n / 60), m = n % 60;
  return m ? `${h} 小时 ${m} 分` : `${h} 小时`;
}
function courseMinutes(project) {
  return Math.max(30, Math.round((Number(project.profile.durationHours) || 0) * 60));
}
function profileSummary(project) {
  return [project.profile.audience, `${Number(project.profile.durationHours) || 0} 小时`].filter(Boolean).join(" · ");
}
function showToast(message) {
  toastNode.textContent = message;
  toastNode.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastNode.classList.remove("show"), 2600);
}
function newStage() { return { output: "", approved: false, stale: false }; }
function createProject(data) {
  const profile = {
    topic: (data.topic || "").trim(), audience: (data.audience || "").trim(), durationHours: data.durationHours || "6",
    businessProblem: (data.businessProblem || "").trim(), expectedPerformance: (data.expectedPerformance || "").trim(),
    learningGoals: (data.learningGoals || "").trim(), coreContent: (data.coreContent || "").trim(), sources: (data.sources || "").trim(), constraints: (data.constraints || "").trim(),
  };
  const project = {
    id: makeId(), name: (data.name || "").trim() || profile.topic, profile,
    stages: [newStage(), newStage()], outline: [], modules: [], materials: { ppt: {}, learner: {}, instructor: {}, handout: {} },
    qaAudits: {}, issues: [], qaChecks: [false, false, false, false], deliveryApproved: false,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  state.projects.unshift(project);
  state.activeId = project.id;
  state.view = "project";
  state.stage = 0;
  state.selectedModule = "";
  modalHost.innerHTML = "";
  persist();
  render();
  showToast("课程项目已创建，从需求分析开始吧。");
}
function touch(project) {
  if (project) project.updatedAt = new Date().toISOString();
  persist();
}
function invalidateFrom(project, index) {
  if (index <= 0) {
    project.stages[0].approved = false;
    project.stages[0].stale = !!project.stages[0].output?.trim();
    project.stages[1].approved = false;
    project.stages[1].stale = !!project.outlineDraft?.length;
    project.modules.forEach((module) => { module.approved = false; module.stale = !!module.output?.trim(); });
    Object.values(project.materials).forEach((items) => Object.values(items).forEach((item) => { item.approved = false; item.stale = !!item.text?.trim(); }));
    Object.values(project.qaAudits).forEach((audit) => { audit.approved = false; audit.stale = !!audit.output?.trim(); });
    project.deliveryApproved = false;
  } else if (index === 1) {
    project.stages[1].approved = false;
    project.stages[1].stale = !!project.outlineDraft?.length;
    project.modules.forEach((module) => { module.approved = false; module.stale = !!module.output?.trim(); });
    Object.values(project.materials).forEach((items) => Object.values(items).forEach((item) => { item.approved = false; item.stale = !!item.text?.trim(); }));
    Object.values(project.qaAudits).forEach((audit) => { audit.approved = false; audit.stale = !!audit.output?.trim(); });
    project.deliveryApproved = false;
  } else if (index === 2) {
    project.modules.forEach((module) => { module.approved = false; module.stale = !!module.output?.trim(); });
    Object.values(project.materials).forEach((items) => Object.values(items).forEach((item) => { item.approved = false; item.stale = !!item.text?.trim(); }));
    Object.values(project.qaAudits).forEach((audit) => { audit.approved = false; audit.stale = !!audit.output?.trim(); });
    project.deliveryApproved = false;
  }
}
function markOutlineEdited(project) {
  project.stages[1].approved = false;
  project.stages[1].stale = false;
  project.modules.forEach((module) => { module.approved = false; module.stale = !!module.output?.trim(); });
  Object.values(project.materials).forEach((items) => Object.values(items).forEach((item) => { item.approved = false; item.stale = !!item.text?.trim(); }));
  Object.values(project.qaAudits).forEach((audit) => { audit.approved = false; audit.stale = !!audit.output?.trim(); });
  project.deliveryApproved = false;
}
function ensureProjectShape(project) {
  project.stages ||= [newStage(), newStage()];
  project.stages[0] ||= newStage(); project.stages[1] ||= newStage();
  project.modules ||= []; project.outline ||= [];
  project.materials ||= { ppt: {}, learner: {}, instructor: {}, handout: {} };
  for (const type of ["ppt", "learner", "instructor", "handout"]) project.materials[type] ||= {};
  project.qaAudits ||= {}; project.issues ||= []; project.qaChecks ||= [false, false, false, false];
}
function stageComplete(project, index) {
  ensureProjectShape(project);
  if (index === 0) return !!project.stages[0].approved && !project.stages[0].stale;
  if (index === 1) return !!project.stages[1].approved && !project.stages[1].stale;
  if (index === 2) return project.modules.length > 0 && project.modules.every((module) => module.approved && !module.stale && module.output?.trim());
  if (index === 3) r