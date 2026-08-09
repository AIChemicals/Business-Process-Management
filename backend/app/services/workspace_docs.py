"""Сборка официальных документов (Markdown) из данных workspace.

Markdown дальше конвертируется в DOCX/PDF в services/docgen.py — той же
проверенной связкой, что в Dalel AI (Times New Roman/Tinos 12, поля по
ГОСТ Р 7.0.97, перенос строк без вылезания за страницу).
"""
from datetime import datetime, timezone

# Нормативные основания для раздела «Источники» в генерируемых документах.
# Только официальные публикации: adilet.zan.kz — эталонный контрольный банк НПА РК.
OFFICIAL_REFERENCES = [
    ("Закон РК «О персональных данных и их защите» № 94-V от 21.05.2013", "https://adilet.zan.kz/rus/docs/Z1300000094"),
    ("Закон РК «Об информатизации» № 418-V от 24.11.2015", "https://adilet.zan.kz/rus/docs/Z1500000418"),
    ("Закон РК «Об электронном документе и ЭЦП» № 370-II от 07.01.2003", "https://adilet.zan.kz/rus/docs/Z030000370_"),
    ("Трудовой кодекс РК № 414-V от 23.11.2015", "https://adilet.zan.kz/rus/docs/K1500000414"),
    ("Нотация BPMN 2.0 (OMG, ISO/IEC 19510:2013)", "https://www.omg.org/spec/BPMN/2.0/"),
]


def pick_name(obj: dict, lang: str) -> str:
    key = "name" + lang.capitalize()
    return obj.get(key) or obj.get("nameRu") or obj.get("nameEn") or obj.get("nameKk") or ""


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%d.%m.%Y")


def _role_name(ws: dict, role_id: str, lang: str) -> str:
    role = next((r for r in ws.get("roles", []) if r.get("id") == role_id), None)
    return pick_name(role, lang) if role else "—"


def _dept_of_role(ws: dict, role_id: str, lang: str) -> str:
    role = next((r for r in ws.get("roles", []) if r.get("id") == role_id), None)
    if not role:
        return "—"
    dept = next((d for d in ws.get("departments", []) if d.get("id") == role.get("deptId")), None)
    return pick_name(dept, lang) if dept else "—"


def _ordered_nodes(template: dict) -> list[dict]:
    """Узлы в порядке обхода от start по соединениям (в глубину, без повторов)."""
    nodes = {n["id"]: n for n in template.get("nodes", [])}
    outgoing: dict[str, list[str]] = {}
    for conn in template.get("connections", []):
        outgoing.setdefault(conn.get("from", ""), []).append(conn.get("to", ""))
    start = next((n["id"] for n in template.get("nodes", []) if n.get("type") == "start"), None)
    if start is None:
        return list(nodes.values())
    ordered: list[dict] = []
    seen: set[str] = set()
    stack = [start]
    while stack:
        node_id = stack.pop(0)
        if node_id in seen or node_id not in nodes:
            continue
        seen.add(node_id)
        ordered.append(nodes[node_id])
        stack.extend(outgoing.get(node_id, []))
    ordered.extend(n for nid, n in nodes.items() if nid not in seen)
    return ordered


def _references_section() -> list[str]:
    lines = ["## Нормативные основания и источники", ""]
    lines += [f"- {title} — {url}" for title, url in OFFICIAL_REFERENCES]
    return lines


NODE_TYPE_RU = {"start": "Старт", "task": "Задача", "gateway": "Шлюз (условие)", "external": "Внешний этап", "end": "Завершение"}


def build_regulation_markdown(ws: dict, template_id: str, lang: str = "ru") -> tuple[str, str]:
    """(markdown, имя_процесса) — регламент бизнес-процесса по его модели."""
    template = next((t for t in ws.get("templates", []) if t.get("id") == template_id), None)
    if template is None:
        raise ValueError("Шаблон процесса не найден в рабочем пространстве")

    name = pick_name(template, lang)
    lines: list[str] = [
        f"# Регламент бизнес-процесса «{name}»",
        "",
        f"Версия модели: {template.get('version', '1.0')}. Дата формирования: {_today()}.",
        "Документ сформирован автоматически BPM-платформой на основе утверждённой модели процесса "
        "(нотация BPMN 2.0) и единой ролево-функциональной матрицы.",
        "",
        "## 1. Общие положения",
        "",
        f"1.1. Настоящий регламент определяет порядок выполнения бизнес-процесса «{name}», "
        "последовательность этапов, ответственных исполнителей и предельные сроки (SLA).",
        "1.2. Регламент обязателен для всех подразделений, участвующих в процессе.",
        "1.3. Изменения в регламент вносятся через актуализацию модели процесса в BPM-системе "
        "с сохранением версии и записи в журнале изменений (аудиторский след).",
        "",
        "## 2. Участники процесса и зоны ответственности",
        "",
    ]

    matrix_rows = [m for m in ws.get("matrix", []) if m.get("processId") == template_id]
    if matrix_rows:
        for row in matrix_rows:
            role = _role_name(ws, row.get("roleId", ""), lang)
            dept = _dept_of_role(ws, row.get("roleId", ""), lang)
            lines.append(f"- **{role}** ({dept}): {row.get('function', '—')}")
    else:
        lines.append("- Зоны ответственности определяются ролево-функциональной матрицей блока.")

    lines += ["", "## 3. Этапы процесса и сроки исполнения (SLA)", ""]
    step = 0
    for node in _ordered_nodes(template):
        node_type = node.get("type", "task")
        title = pick_name(node, lang)
        if node_type == "start":
            lines.append(f"3.0. Начало процесса: {title}.")
        elif node_type == "end":
            lines.append(f"Завершение процесса: {title}.")
        elif node_type == "gateway":
            step += 1
            lines.append(
                f"3.{step}. **{title}** — точка принятия решения. Условие перехода: "
                f"`{node.get('condition', '—')}`. При выполнении условия процесс идёт по ветке «Да», "
                "иначе — по ветке «Нет»."
            )
        else:
            step += 1
            role = _role_name(ws, node.get("roleId", ""), lang)
            sla = node.get("sla", "—")
            kind = " (внешняя организация)" if node_type == "external" else ""
            lines.append(f"3.{step}. **{title}** — исполнитель: {role}{kind}. Срок исполнения: {sla} ч.")

    lines += [
        "",
        "## 4. Контроль исполнения",
        "",
        "4.1. Контроль сроков осуществляется BPM-системой автоматически: предупреждение при "
        "приближении срока и эскалация при нарушении SLA.",
        "4.2. Все действия и переходы по процессу журналируются (аудиторский след) и доступны "
        "для анализа в модуле аналитики.",
        "4.3. Персональные данные участников процесса обрабатываются в соответствии с Законом РК "
        "«О персональных данных и их защите».",
        "",
    ]
    lines += _references_section()
    return "\n".join(lines), name


def build_matrix_markdown(ws: dict, lang: str = "ru") -> str:
    """Отчёт «Ролево-функциональная матрица блока» для выгрузки в DOCX/PDF."""
    lines: list[str] = [
        "# Ролево-функциональная матрица блока",
        "",
        f"Дата формирования: {_today()}. Документ сформирован автоматически BPM-платформой.",
        "",
        "## 1. Назначение",
        "",
        "Единая ролево-функциональная матрица связывает роли сотрудников, их функции и процессы, "
        "в которых они участвуют, и служит единым источником истины при актуализации внутренних "
        "нормативных документов (ВНД).",
        "",
        "## 2. Матрица «роль — функция — процесс»",
        "",
    ]
    for process in ws.get("templates", []):
        lines += [f"## Процесс: {pick_name(process, lang)}", ""]
        rows = [m for m in ws.get("matrix", []) if m.get("processId") == process.get("id")]
        if not rows:
            lines += ["- Назначения не заданы.", ""]
            continue
        for row in rows:
            role = _role_name(ws, row.get("roleId", ""), lang)
            dept = _dept_of_role(ws, row.get("roleId", ""), lang)
            lines.append(f"- **{role}** ({dept}) — {row.get('function', '—')}")
        lines.append("")

    versions = ws.get("matrixVersions", [])
    if versions:
        lines += ["## 3. История версий матрицы", ""]
        for version in versions[-10:]:
            lines.append(
                f"- Версия {version.get('version', '—')} от {version.get('date', '—')}: "
                f"{version.get('comment', 'без комментария')}"
            )
        lines.append("")
    lines += _references_section()
    return "\n".join(lines)


def workspace_summary_for_ai(ws: dict, lang: str = "ru") -> str:
    """Компактная сводка workspace для контекста ассистента."""
    if not ws:
        return "Рабочее пространство пользователя пусто (данные ещё не синхронизированы)."
    parts: list[str] = []
    depts = ws.get("departments", [])
    roles = ws.get("roles", [])
    if depts:
        parts.append("Отделы: " + "; ".join(pick_name(d, lang) for d in depts[:20]))
    if roles:
        parts.append(
            "Роли: "
            + "; ".join(f"{pick_name(r, lang)} ({_dept_of_role(ws, r.get('id', ''), lang)})" for r in roles[:30])
        )
    for template in ws.get("templates", [])[:10]:
        steps = []
        for node in _ordered_nodes(template):
            if node.get("type") in {"task", "external", "gateway"}:
                label = pick_name(node, lang)
                if node.get("type") == "gateway":
                    label += f" [условие: {node.get('condition', '')}]"
                else:
                    label += f" [{_role_name(ws, node.get('roleId', ''), lang)}, SLA {node.get('sla', '?')} ч]"
                steps.append(label)
        parts.append(f"Процесс «{pick_name(template, lang)}»: " + " → ".join(steps))
    active = [i for i in ws.get("instances", []) if i.get("status") == "active"]
    if active:
        parts.append(f"Активных экземпляров процессов: {len(active)}.")
    return "\n".join(parts) if parts else "Рабочее пространство пользователя пусто."
