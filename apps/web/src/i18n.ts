import { useEffect } from "react";

export type SiteLanguage = "en" | "ar";

const arabic: Record<string, string> = {
  "Task Allocator": "نظام توزيع المهام",
  "Change language": "تغيير اللغة",
  "Command Center": "مركز القيادة",
  "Dashboard": "لوحة التحكم",
  "Active Tasks": "المهام النشطة",
  "My TODOs": "مهامي اليومية",
  "Projects": "المشاريع",
  "Finished Tasks": "المهام المكتملة",
  "Achievements": "الإنجازات",
  "Attendance": "الحضور",
  "People": "الأشخاص",
  "People Directory": "دليل الموظفين",
  "Team": "الفريق",
  "Team Performance": "أداء الفريق",
  "Productivity": "الإنتاجية",
  "Main navigation": "التنقل الرئيسي",
  "Current department": "القسم الحالي",
  "Super Admin": "المشرف العام",
  "Admin": "المشرف",
  "Normal User": "مستخدم",
  "New Task": "مهمة جديدة",
  "Messages": "الرسائل",
  "Close messages": "إغلاق الرسائل",
  "Department & direct chat": "محادثات القسم والمحادثات المباشرة",
  "Department": "القسم",
  "Groups": "المجموعات",
  "Direct Messages": "الرسائل المباشرة",
  "Create Group": "إنشاء مجموعة",
  "AI Assistant": "المساعد الذكي",
  "MAB AI Assistant": "مساعد MAB الذكي",
  "Write a message": "اكتب رسالة",
  "Send": "إرسال",
  "Sending…": "جارٍ الإرسال…",
  "Uploading…": "جارٍ الرفع…",
  "Reply": "رد",
  "Edit": "تعديل",
  "Delete": "حذف",
  "Save": "حفظ",
  "Cancel": "إلغاء",
  "This message was deleted": "تم حذف هذه الرسالة",
  "Delete message?": "حذف الرسالة؟",
  "Delete for me": "حذف لدي",
  "Delete for everyone": "حذف لدى الجميع",
  "Other people will still see this message.": "سيستمر الآخرون في رؤية هذه الرسالة.",
  "A deleted-message notice will remain.": "ستبقى إشارة تفيد بحذف الرسالة.",
  "Notifications": "الإشعارات",
  "Open": "فتح",
  "Logout": "تسجيل الخروج",
  "Light mode": "الوضع الفاتح",
  "Dark mode": "الوضع الداكن",
  "Quick Actions": "إجراءات سريعة",
  "Shortcuts": "اختصارات",
  "New task": "مهمة جديدة",
  "Free tasks": "المهام المتاحة",
  "Operations": "العمليات",
  "At a glance": "نظرة سريعة",
  "Team members": "أعضاء الفريق",
  "Urgent tasks": "المهام العاجلة",
  "Completed tasks": "المهام المكتملة",
  "Needs Review": "تحتاج مراجعة",
  "Overdue": "متأخرة",
  "Average Progress": "متوسط التقدم",
  "Create New Task": "إنشاء مهمة جديدة",
  "Task title": "عنوان المهمة",
  "Project": "المشروع",
  "No project": "بدون مشروع",
  "Assign people": "تعيين الموظفين",
  "Task type": "نوع المهمة",
  "Priority": "الأولوية",
  "Complexity": "التعقيد",
  "Planned due date": "تاريخ الاستحقاق المخطط",
  "Initial progress": "التقدم المبدئي",
  "Add task documents": "إضافة مستندات المهمة",
  "Create Task": "إنشاء المهمة",
  "Low priority": "أولوية منخفضة",
  "Medium priority": "أولوية متوسطة",
  "High priority": "أولوية عالية",
  "Urgent priority": "أولوية عاجلة",
  "Low": "منخفضة",
  "Medium": "متوسطة",
  "High": "عالية",
  "Urgent": "عاجلة",
  "New": "جديدة",
  "Assigned": "معيّنة",
  "In Progress": "قيد التنفيذ",
  "Blocked": "متوقفة",
  "Under Review": "قيد المراجعة",
  "Done": "مكتملة",
  "Take Task": "استلام المهمة",
  "Task created": "تم إنشاء المهمة",
  "Task updated": "تم تحديث المهمة",
  "Task requested": "تم طلب المهمة",
  "Claim approved · task started": "تمت الموافقة على الطلب · بدأت المهمة",
  "Claim rejected": "تم رفض الطلب",
  "Work submitted": "تم تسليم العمل",
  "Manager approved · task completed": "وافق المشرف · اكتملت المهمة",
  "Task reopened": "أُعيد فتح المهمة",
  "Task opened": "تم فتح المهمة",
  "Comment added": "تمت إضافة تعليق",
  "Comment edited": "تم تعديل التعليق",
  "Comment deleted": "تم حذف التعليق",
  "Files uploaded": "تم رفع الملفات",
  "Task reassigned": "تمت إعادة تعيين المهمة",
  "Work Intelligence": "ذكاء العمل",
  "Admin Audit": "سجل تدقيق الإدارة",
  "Mark all read": "تحديد الكل كمقروء",
  "Workflow & updates": "سير العمل والتحديثات",
  "Workflow history": "سجل سير العمل",
  "Reopen Completed Task": "إعادة فتح المهمة المكتملة",
  "Explain why this completed task must be reopened": "اشرح سبب ضرورة إعادة فتح المهمة المكتملة",
  "Finish Task": "إنهاء المهمة",
  "Approve": "اعتماد",
  "Reopen": "إعادة فتح",
  "Create Project": "إنشاء مشروع",
  "Project name": "اسم المشروع",
  "Description": "الوصف",
  "Project members": "أعضاء المشروع",
  "Save changes": "حفظ التغييرات",
  "Delete project": "حذف المشروع",
  "Completed work archive": "أرشيف الأعمال المكتملة",
  "Total completed": "إجمالي المكتمل",
  "This month": "هذا الشهر",
  "On time": "في الموعد",
  "More filters": "المزيد من عوامل التصفية",
  "All priorities": "كل الأولويات",
  "Assigned person": "الموظف المعيّن",
  "All people": "كل الموظفين",
  "Completed from": "مكتملة من",
  "Completed to": "مكتملة إلى",
  "Clear filters": "مسح عوامل التصفية",
  "No finished tasks found": "لا توجد مهام مكتملة",
  "Monthly Achievements": "الإنجازات الشهرية",
  "Department performance race": "سباق أداء القسم",
  "Month": "الشهر",
  "Rank": "الترتيب",
  "Team member": "عضو الفريق",
  "Achievement points": "نقاط الإنجاز",
  "Productivity index": "مؤشر الإنتاجية",
  "Complexity delivered": "التعقيد المنجز",
  "Speed vs peers": "السرعة مقارنةً بالفريق",
  "Team tasks": "المهام الجماعية",
  "Reopens": "مرات إعادة الفتح",
  "Evaluation": "التقييم",
  "Outstanding": "متميز",
  "Strong": "قوي",
  "Developing": "قيد التطور",
  "Needs support": "يحتاج دعماً",
  "Building history": "جارٍ بناء السجل",
  "How the fair score is calculated": "كيفية احتساب النتيجة العادلة",
  "Attendance month": "شهر الحضور",
  "Present today": "الحاضرون اليوم",
  "Tracked employees": "الموظفون المتابعون",
  "Average attendance": "متوسط الحضور",
  "KPI weighting": "وزن مؤشر الأداء",
  "Employee": "الموظف",
  "Present days": "أيام الحضور",
  "Expected workdays": "أيام العمل المتوقعة",
  "Attendance rate": "نسبة الحضور",
  "Login sessions": "مرات تسجيل الدخول",
  "Last login": "آخر تسجيل دخول",
  "No login recorded": "لا يوجد تسجيل دخول",
  "Analysis month": "شهر التحليل",
  "All time": "كل الفترات",
  "Completion rate": "نسبة الإنجاز",
  "On-time rate": "نسبة الالتزام بالموعد",
  "Active now": "نشطة الآن",
  "Active complexity": "تعقيد المهام النشطة",
  "Completed points": "النقاط المكتملة",
  "Achievement score": "نتيجة الإنجاز",
  "Admin reopens": "إعادات الفتح من المشرف",
  "Attendance KPI": "مؤشر الحضور",
  "Download": "تنزيل",
  "Username": "اسم المستخدم",
  "Password": "كلمة المرور",
  "Welcome back": "مرحباً بعودتك",
  "Secure access": "دخول آمن",
  "Login to Dashboard": "الدخول إلى لوحة التحكم",
  "Confirm deletion": "تأكيد الحذف",
  "Yes, delete": "نعم، احذف",
  "Search": "بحث",
  "All departments": "كل الأقسام",
  "Completion month": "شهر الإنجاز",
  "Total assigned": "إجمالي المهام المعيّنة",
  "Finished in month": "المكتمل خلال الشهر",
  "Average cycle time": "متوسط مدة الإنجاز",
  "Report": "التقرير",
  "Active load": "عبء العمل النشط",
  "No notifications yet.": "لا توجد إشعارات بعد.",
  "No normal users in this department.": "لا يوجد مستخدمون في هذا القسم.",
  "Private conversation · responses may need review": "محادثة خاصة · قد تحتاج الإجابات إلى مراجعة",
  "No messages yet. Say hello to your department.": "لا توجد رسائل بعد. ابدأ المحادثة مع قسمك.",
  "Mention someone": "الإشارة إلى شخص",
  "People in this conversation": "المشاركون في هذه المحادثة"
};

const originalText = new WeakMap<Text, string>();
const originalAttributes = new WeakMap<Element, Map<string, string>>();

function translated(value: string) {
  const leading = value.match(/^\s*/)?.[0] ?? "";
  const trailing = value.match(/\s*$/)?.[0] ?? "";
  const text = value.trim();
  let result = arabic[text];
  if (!result) {
    const patterns: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
      [/^(\d+) members?$/, (match) => `${match[1]} عضو`],
      [/^(\d+) unread$/, (match) => `${match[1]} غير مقروء`],
      [/^(\d+) recent$/, (match) => `${match[1]} حديث`],
      [/^(\d+) results?$/, (match) => `${match[1]} نتيجة`],
      [/^(\d+) points?$/, (match) => `${match[1]} نقطة`],
      [/^(\d+) days?$/, (match) => `${match[1]} يوم`]
    ];
    for (const [pattern, transform] of patterns) {
      const match = text.match(pattern);
      if (match) { result = transform(match); break; }
    }
  }
  return result ? `${leading}${result}${trailing}` : value;
}

function translateTree(language: SiteLanguage) {
  const root = document.body;
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  while (node) {
    const parent = node.parentElement;
    if (parent && !["SCRIPT", "STYLE"].includes(parent.tagName)) {
      if (!originalText.has(node)) originalText.set(node, node.nodeValue ?? "");
      const source = originalText.get(node) ?? "";
      const next = language === "ar" ? translated(source) : source;
      if (node.nodeValue !== next) node.nodeValue = next;
    }
    node = walker.nextNode() as Text | null;
  }

  document.querySelectorAll("[placeholder], [title], [aria-label]").forEach((element) => {
    let saved = originalAttributes.get(element);
    if (!saved) { saved = new Map(); originalAttributes.set(element, saved); }
    for (const attribute of ["placeholder", "title", "aria-label"]) {
      const current = element.getAttribute(attribute);
      if (current !== null && !saved.has(attribute)) saved.set(attribute, current);
      const source = saved.get(attribute);
      if (source !== undefined) {
        const next = language === "ar" ? translated(source) : source;
        if (element.getAttribute(attribute) !== next) element.setAttribute(attribute, next);
      }
    }
  });
}

export function useSiteTranslation(language: SiteLanguage) {
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
    translateTree(language);
  });
}
