# BPM System and Role-Functional Matrix

A high-fidelity, web-based Business Process Management (BPM) system prototype built in accordance with the project's Technical Specification (ТЗ) for digitalizing, automating, and mapping business processes of a corporate unit.

## 🚀 Key Features

1. **Role-Functional Matrix Module**
   - Renders a unified grid linking Departments, Roles, Functions, and Processes.
   - Interactive search and filter panel (by role/department/process).
   - Real-time cell editing modal with dynamic responsibility mapping.
   - Automated Excel export (generates standard CSV with UTF-8 BOM encoding).
   - PDF Print Layout (pre-styled print stylesheet removes sidebars/headers for professional reports).
   - History logging & version tracking (rollback to previous version snapshots).

2. **Visual BPMN Modeler**
   - SVG-based drag-and-drop workflow canvas.
   - BPMN 2.0-aligned elements: Start Event, User Task, Gateway Condition, External Task, End Event.
   - Interactive connection tool (drag connectors between nodes).
   - Inspector panel to configure step details (name, assignee role, SLA hours, gateway conditional branches).
   - Instant "Run Simulation" trigger linking visual templates to execution nodes.

3. **Workflow Engine & Simulation Clock**
   - Active process instance launcher with custom parameters (e.g. budget variables to check gateways).
   - Sim Clock generator: advances time in hours (configurable speed multiplier e.g., 1s real-time = 1 hour simulated).
   - Inbox/Registry: filter tasks by simulated active role (lets you act as Initiator, Legal, Finance, Director, etc., to complete workflows).
   - SLA tracking with warnings (≤6 hours remaining) and breach alerts.
   - Interactive comment threads and document attachments.

4. **External Organization Portal**
   - Tracking table for stages requiring external counterparty involvement (e.g. vendor deliveries).
   - Simulated external portal view to provide mock approvals and responses, advancing process stages.

5. **Analytics and SLA Monitoring**
   - Core KPIs: active processes, completed cycles, SLA compliance rate, average process duration.
   - Dynamic SVG Charts: average process duration bars, load indicators by department, and active/overdue trends.
   - Bottlenecks registry listing steps that breach SLA.

6. **Administration**
   - Manage core organizational structure guides (Add/Delete Departments and Roles).
   - Simulation controls (speed settings slider, reset database back to defaults).
   - Multilingual localization support for Russian (RU) and Kazakh (KK).

## 🛠️ Technology Stack
- **Frontend Core**: Vanilla HTML5, ES6+ Javascript modules.
- **Styling**: Vanilla CSS3 (Custom design system variables, glassmorphism, responsive grid, print media rules).
- **Libraries**: Fully self-contained SVG modules (zero external framework dependencies like React/Vue, ensuring zero build latency).

## 💻 How to Run Locally

To launch the system, serve the workspace directory using any simple HTTP server. 

Run the following command in your terminal from the project folder:

```powershell
npx -y http-server -p 8080
```

Once running, open your web browser and navigate to:
**http://localhost:8080**

*Note: The system automatically persists all templates, matrix changes, running instances, and tasks in your browser's `localStorage` so that your simulated runs and designs remain intact upon page refresh.*