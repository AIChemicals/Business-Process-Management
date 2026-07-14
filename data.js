const DEFAULT_DEPARTMENTS = [
    { id: "dept_initiator", nameRu: "Блок инициации", nameKk: "Бастамашылық блок" },
    { id: "dept_legal", nameRu: "Юридический департамент", nameKk: "Заң департаменті" },
    { id: "dept_finance", nameRu: "Финансовый департамент", nameKk: "Қаржы департаменті" },
    { id: "dept_admin", nameRu: "Административный блок", nameKk: "Әкімшілік блок" },
    { id: "dept_external", nameRu: "Внешние контрагенты", nameKk: "Сыртқы контрагенттер" }
];

const DEFAULT_ROLES = [
    { id: "role_initiator", nameRu: "Инициатор процесса", nameKk: "Процесті бастамашысы", deptId: "dept_initiator" },
    { id: "role_dept_head", nameRu: "Руководитель отдела", nameKk: "Бөлім меңгерушісі", deptId: "dept_initiator" },
    { id: "role_legal", nameRu: "Юрист", nameKk: "Заңгер", deptId: "dept_legal" },
    { id: "role_finance", nameRu: "Финансовый контроллер", nameKk: "Қаржы бақылаушысы", deptId: "dept_finance" },
    { id: "role_director", nameRu: "Директор блока", nameKk: "Блок директоры", deptId: "dept_admin" },
    { id: "role_external_vendor", nameRu: "Внешний поставщик", nameKk: "Сыртқы өнім беруші", deptId: "dept_external" }
];

const DEFAULT_PROCESS_TEMPLATES = [
    {
        id: "proc_contract",
        nameRu: "Согласование коммерческих договоров",
        nameKk: "Коммерциялық шарттарды келісу",
        version: "1.0",
        nodes: [
            { id: "node_start", type: "start", nameRu: "Старт процесса", nameKk: "Процестің басталуы", x: 50, y: 150 },
            { id: "node_prepare", type: "task", nameRu: "Подготовка проекта договора", nameKk: "Шарт жобасын дайындау", roleId: "role_initiator", sla: 24, x: 150, y: 125 },
            { id: "node_legal_review", type: "task", nameRu: "Правовая экспертиза договора", nameKk: "Шартқа құқықтық сараптама", roleId: "role_legal", sla: 48, x: 300, y: 125 },
            { id: "node_finance_review", type: "task", nameRu: "Бюджетный контроль договора", nameKk: "Шартты бюджеттік бақылау", roleId: "role_finance", sla: 24, x: 450, y: 125 },
            { id: "node_sign", type: "task", nameRu: "Подписание договора директором", nameKk: "Директордың шартқа қол қоюы", roleId: "role_director", sla: 12, x: 600, y: 125 },
            { id: "node_end", type: "end", nameRu: "Договор согласован и подписан", nameKk: "Шарт келісілді және қол қойылды", x: 750, y: 150 }
        ],
        connections: [
            { from: "node_start", to: "node_prepare" },
            { from: "node_prepare", to: "node_legal_review" },
            { from: "node_legal_review", to: "node_finance_review" },
            { from: "node_finance_review", to: "node_sign" },
            { from: "node_sign", to: "node_end" }
        ]
    },
    {
        id: "proc_procurement",
        nameRu: "Закупка оборудования и ТМЦ",
        nameKk: "Жабдықтарды және ТМҚ сатып алу",
        version: "1.2",
        nodes: [
            { id: "node_start", type: "start", nameRu: "Старт закупки", nameKk: "Сатып алуды бастау", x: 50, y: 150 },
            { id: "node_req", type: "task", nameRu: "Формирование заявки на закупку", nameKk: "Сатып алуға өтінім жасау", roleId: "role_initiator", sla: 24, x: 140, y: 125 },
            { id: "node_head_approve", type: "task", nameRu: "Одобрение заявки руководителем", nameKk: "Өтінімді басшының мақұлдауы", roleId: "role_dept_head", sla: 12, x: 280, y: 125 },
            { id: "node_gateway", type: "gateway", nameRu: "Бюджет > 5 млн тенге?", nameKk: "Бюджет > 5 млн теңге?", condition: "budget > 5000000", targetYes: "node_director_approve", targetNo: "node_finance_approve", x: 420, y: 130 },
            { id: "node_director_approve", type: "task", nameRu: "Утверждение директором", nameKk: "Директордың бекітуі", roleId: "role_director", sla: 24, x: 530, y: 50 },
            { id: "node_finance_approve", type: "task", nameRu: "Выделение средств финансистом", nameKk: "Қаржыгердің қаражат бөлуі", roleId: "role_finance", sla: 24, x: 530, y: 200 },
            { id: "node_external_order", type: "external", nameRu: "Размещение заказа у поставщика", nameKk: "Тапсырысты жеткізушіге жіберу", roleId: "role_external_vendor", sla: 72, x: 680, y: 125 },
            { id: "node_accept", type: "task", nameRu: "Приемка и учет оборудования", nameKk: "Жабдықты қабылдау және есепке алу", roleId: "role_initiator", sla: 48, x: 820, y: 125 },
            { id: "node_end", type: "end", nameRu: "Закупка успешно завершена", nameKk: "Сатып алу сәтті аяқталды", x: 960, y: 150 }
        ],
        connections: [
            { from: "node_start", to: "node_req" },
            { from: "node_req", to: "node_head_approve" },
            { from: "node_head_approve", to: "node_gateway" },
            { from: "node_gateway", to: "node_director_approve", label: "Да (Yes)" },
            { from: "node_gateway", to: "node_finance_approve", label: "Нет (No)" },
            { from: "node_director_approve", to: "node_external_order" },
            { from: "node_finance_approve", to: "node_external_order" },
            { from: "node_external_order", to: "node_accept" },
            { from: "node_accept", to: "node_end" }
        ]
    }
];

const DEFAULT_MATRIX = [
    // Process 1: Contract Approval
    { roleId: "role_initiator", processId: "proc_contract", function: "Инициация и разработка проекта / Бастама және жобаны әзірлеу" },
    { roleId: "role_legal", processId: "proc_contract", function: "Правовой анализ и согласование рисков / Құқықтық талдау және тәуекелдерді келісу" },
    { roleId: "role_finance", processId: "proc_contract", function: "Проверка финансовых обязательств и бюджета / Қаржылық міндеттемелер мен бюджетті тексеру" },
    { roleId: "role_director", processId: "proc_contract", function: "Финальное утверждение и подписание / Түпкілікті бекіту және қол қою" },

    // Process 2: Procurement Request
    { roleId: "role_initiator", processId: "proc_procurement", function: "Заявка на ТМЦ и финальная приемка / ТМҚ өтінімі және түпкілікті қабылдау" },
    { roleId: "role_dept_head", processId: "proc_procurement", function: "Согласование потребности отдела / Бөлім қажеттілігін келісу" },
    { roleId: "role_director", processId: "proc_procurement", function: "Утверждение крупных закупок (>5 млн) / Ірі сатып алуларды бекіту (>5 млн)" },
    { roleId: "role_finance", processId: "proc_procurement", function: "Выделение бюджетных лимитов / Бюджеттік лимиттерді бөлу" },
    { roleId: "role_external_vendor", processId: "proc_procurement", function: "Поставка товара и выставление счетов / Тауарды жеткізу және шоттарды ұсыну" }
];

const DEFAULT_MATRIX_VERSIONS = [
    { version: "1.0", date: "2026-06-01 10:00", comment: "Первоначальное утверждение ВНД", matrix: [...DEFAULT_MATRIX] }
];

// Predefined simulated process instances for direct display on charts/inbox
const DEFAULT_INSTANCES = [
    {
        id: "inst_1",
        templateId: "proc_contract",
        name: "Договор на аренду офиса №A-45",
        status: "active",
        currentNodeId: "node_legal_review",
        startedAt: "2026-07-11T12:00:00Z",
        variables: { budget: 1500000 },
        auditTrail: [
            { nodeId: "node_start", action: "start", userId: "role_initiator", timestamp: "2026-07-11T12:05:00Z" },
            { nodeId: "node_prepare", action: "complete", userId: "role_initiator", timestamp: "2026-07-12T09:30:00Z" }
        ]
    },
    {
        id: "inst_2",
        templateId: "proc_procurement",
        name: "Закупка серверов для базы данных",
        status: "active",
        currentNodeId: "node_director_approve",
        startedAt: "2026-07-10T08:00:00Z",
        variables: { budget: 8500000 }, // Triggers director approval gateway path
        auditTrail: [
            { nodeId: "node_start", action: "start", userId: "role_initiator", timestamp: "2026-07-10T08:15:00Z" },
            { nodeId: "node_req", action: "complete", userId: "role_initiator", timestamp: "2026-07-11T10:00:00Z" },
            { nodeId: "node_head_approve", action: "complete", userId: "role_dept_head", timestamp: "2026-07-12T14:00:00Z" }
        ]
    },
    {
        id: "inst_3",
        templateId: "proc_contract",
        name: "Договор поставки канцелярии",
        status: "completed",
        currentNodeId: "node_end",
        startedAt: "2026-07-05T09:00:00Z",
        variables: { budget: 200000 },
        auditTrail: [
            { nodeId: "node_start", action: "start", userId: "role_initiator", timestamp: "2026-07-05T09:00:00Z" },
            { nodeId: "node_prepare", action: "complete", userId: "role_initiator", timestamp: "2026-07-05T14:00:00Z" },
            { nodeId: "node_legal_review", action: "complete", userId: "role_legal", timestamp: "2026-07-06T16:00:00Z" },
            { nodeId: "node_finance_review", action: "complete", userId: "role_finance", timestamp: "2026-07-07T11:00:00Z" },
            { nodeId: "node_sign", action: "complete", userId: "role_director", timestamp: "2026-07-08T10:00:00Z" }
        ]
    }
];

const DEFAULT_TASKS = [
    {
        id: "task_1",
        instanceId: "inst_1",
        nodeId: "node_legal_review",
        nameRu: "Правовая экспертиза договора",
        nameKk: "Шартқа құқықтық сараптама",
        roleId: "role_legal",
        status: "active",
        createdAt: "2026-07-12T09:30:00Z",
        dueDate: "2026-07-14T09:30:00Z", // 48h SLA
        comments: [
            { user: "Инициатор", text: "Срочный договор, просим согласовать побыстрее.", timestamp: "2026-07-12T09:35:00Z" }
        ],
        documents: [
            { name: "Draft_Agreement_Office.docx", size: "128 KB", url: "#" }
        ]
    },
    {
        id: "task_2",
        instanceId: "inst_2",
        nodeId: "node_director_approve",
        nameRu: "Утверждение закупки (бюджет > 5 млн)",
        nameKk: "Сатып алуды бекіту (бюджет > 5 млн)",
        roleId: "role_director",
        status: "active",
        createdAt: "2026-07-12T14:00:00Z",
        dueDate: "2026-07-13T14:00:00Z", // 24h SLA. Very close to breaching SLA (current simulated time is July 13th)
        comments: [],
        documents: [
            { name: "Server_Specs_CostEstimate.pdf", size: "2.4 MB", url: "#" }
        ]
    }
];

class Database {
    constructor() {
        this.load();
    }

    load() {
        try {
            this.departments = JSON.parse(localStorage.getItem("bpm_departments")) || DEFAULT_DEPARTMENTS;
            this.roles = JSON.parse(localStorage.getItem("bpm_roles")) || DEFAULT_ROLES;
            this.templates = JSON.parse(localStorage.getItem("bpm_templates")) || DEFAULT_PROCESS_TEMPLATES;
            this.matrix = JSON.parse(localStorage.getItem("bpm_matrix")) || DEFAULT_MATRIX;
            this.matrixVersions = JSON.parse(localStorage.getItem("bpm_matrix_versions")) || DEFAULT_MATRIX_VERSIONS;
            this.instances = JSON.parse(localStorage.getItem("bpm_instances")) || DEFAULT_INSTANCES;
            this.tasks = JSON.parse(localStorage.getItem("bpm_tasks")) || DEFAULT_TASKS;
            this.systemTime = localStorage.getItem("bpm_system_time") || "2026-07-13T15:48:00Z";
            this.timeSpeed = parseFloat(localStorage.getItem("bpm_time_speed")) || 1.0;
        } catch (e) {
            console.error("Failed to load database from localStorage, initializing default state.", e);
            this.reset();
        }
    }

    save() {
        localStorage.setItem("bpm_departments", JSON.stringify(this.departments));
        localStorage.setItem("bpm_roles", JSON.stringify(this.roles));
        localStorage.setItem("bpm_templates", JSON.stringify(this.templates));
        localStorage.setItem("bpm_matrix", JSON.stringify(this.matrix));
        localStorage.setItem("bpm_matrix_versions", JSON.stringify(this.matrixVersions));
        localStorage.setItem("bpm_instances", JSON.stringify(this.instances));
        localStorage.setItem("bpm_tasks", JSON.stringify(this.tasks));
        localStorage.setItem("bpm_system_time", this.systemTime);
        localStorage.setItem("bpm_time_speed", this.timeSpeed.toString());
    }

    reset() {
        this.departments = JSON.parse(JSON.stringify(DEFAULT_DEPARTMENTS));
        this.roles = JSON.parse(JSON.stringify(DEFAULT_ROLES));
        this.templates = JSON.parse(JSON.stringify(DEFAULT_PROCESS_TEMPLATES));
        this.matrix = JSON.parse(JSON.stringify(DEFAULT_MATRIX));
        this.matrixVersions = JSON.parse(JSON.stringify(DEFAULT_MATRIX_VERSIONS));
        this.instances = JSON.parse(JSON.stringify(DEFAULT_INSTANCES));
        this.tasks = JSON.parse(JSON.stringify(DEFAULT_TASKS));
        this.systemTime = "2026-07-13T15:48:00Z";
        this.timeSpeed = 1.0;
        this.save();
    }
}

const db = new Database();
export default db;
