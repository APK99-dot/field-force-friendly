

# Plan: Copy Projects Module from Staging-QuickApp

## Overview

The staging project has a full-featured **Project Management (PM) module** with 20+ database tables, 30+ component files, and 2 hook files. This is a substantial module covering projects, tasks, Kanban boards, sprints, milestones, Gantt charts, timesheets, risks, templates, and more.

## What Needs to Be Created

### 1. Database Schema (Migration)

Create all PM-related tables, enums, and RLS policies. The staging project uses these tables:

**Core Tables:**
- `pm_projects` -- Projects with status, priority, budget, dates, owner, color, template flag
- `pm_tasks` -- Tasks with status, priority, assignee, sprint, milestone, section, subtasks, tags, story points
- `pm_sections` -- Kanban board sections per project
- `pm_sprints` -- Sprint planning per project
- `pm_milestones` -- Project milestones with due dates

**Supporting Tables:**
- `pm_task_attachments` -- File attachments on tasks
- `pm_task_dependencies` -- Task-to-task dependency links
- `pm_task_collaborators` -- Multiple collaborators per task
- `pm_task_comments` -- Comments on tasks
- `pm_time_logs` -- Time tracking per task
- `pm_project_members` -- Project membership with roles
- `pm_project_resources` -- Resource allocation with rates
- `pm_risks` -- Risk register per project

**Template System:**
- `pm_templates` -- Reusable project templates
- `pm_template_sections` -- Template sections
- `pm_template_tasks` -- Template tasks with duration_days
- `pm_template_dependencies` -- Template task dependencies
- `pm_template_attachments` -- Template task attachments
- `pm_task_templates` -- Standalone task templates

**AI/Extended Features:**
- `pm_ai_insights` -- AI-generated project insights
- `pm_ideas` -- Idea submissions per project
- `pm_knowledge_documents` -- Knowledge base per project
- `pm_support_requests` -- Support requests per project

**Enums to create:**
- `pm_priority`: critical, high, medium, low
- `pm_project_status`: planning, active, on_hold, completed, cancelled
- `pm_task_status`: backlog, todo, in_progress, in_review, done, cancelled, overdue
- `pm_task_type`: epic, story, task, bug, idea, milestone
- `pm_sprint_status`: planning, active, completed, cancelled
- `pm_member_role`: owner, manager, developer, designer, tester, viewer

**Storage bucket:**
- `pm-attachments` -- For task file attachments

**RLS Policies:** All tables will have admin full-access and user-level read/write policies based on project membership or ownership.

### 2. Hooks (2 files)

- `src/hooks/useProjects.ts` (~755 lines) -- All CRUD hooks for projects, tasks, sections, sprints, milestones, risks, time logs, attachments, dependencies, collaborators
- `src/hooks/useTemplates.ts` -- All CRUD hooks for the template system

**Adaptation needed:** The staging uses `useAuth()` from a custom AuthProvider. This project does not have that hook. Will replace with `supabase.auth.getUser()` calls inline (same pattern used elsewhere in this project).

### 3. Components (29 files in `src/components/pm/`)

- `CreateProjectModal.tsx` -- Project creation form with template selection
- `CreateTaskModal.tsx` -- Task creation with owner picker, collaborators, tags
- `KanbanBoard.tsx` -- Drag-and-drop board grouped by section/status/priority/assignee
- `BacklogView.tsx` -- Work plan / list view of tasks
- `CalendarView.tsx` -- Calendar display of tasks by due date
- `GanttChart.tsx` -- Gantt timeline view
- `TimesheetView.tsx` -- Time logging interface
- `SprintsPanel.tsx` -- Sprint management
- `MilestonesPanel.tsx` -- Milestone tracking
- `RisksPanel.tsx` -- Risk register
- `ProjectOverview.tsx` -- Dashboard/summary view
- `TaskDetailPanel.tsx` -- Slide-over task detail editor
- `TaskStatusBadge.tsx` -- Status/priority badge components
- `TaskSubtasks.tsx` -- Subtask management
- `TaskAttachments.tsx` -- File attachment management
- `TaskDependencies.tsx` -- Dependency management
- `TaskTimesheetSection.tsx` -- Time logging in task detail
- `ResourcesPanel.tsx` -- Resource allocation panel
- `MultiUserPicker.tsx` -- Multi-user selector component
- `IdeasPanel.tsx` -- Ideas submission and management
- `KnowledgePanel.tsx` -- Knowledge base document management
- `SupportPanel.tsx` -- Support request management
- `AIDescriptionWriter.tsx` -- AI-powered task description
- `AIHealthCheck.tsx` -- AI project health analysis
- `AIKnowledgeAssistant.tsx` -- AI knowledge Q&A
- `AIRiskPredictor.tsx` -- AI risk prediction
- `AISubtaskGenerator.tsx` -- AI subtask generation
- `AIWorkloadAnalysis.tsx` -- AI workload analysis
- `TemplateWorkPlanView.tsx` -- Template work plan viewer

### 4. Pages (5 files in `src/pages/pm/`)

- `ProjectsPage.tsx` -- Project listing with stats, search, filters, grid cards
- `ProjectDetailPage.tsx` -- Full project workspace with tabbed views (Board, Work Plan, Calendar, Gantt, Timesheet, Sprints, Resources, Overview, Risks, Ideas, Knowledge, Support, Templates)
- `TemplatesPage.tsx` -- Template listing
- `TemplateBuilderPage.tsx` -- Template editor
- `ResourceDetailPage.tsx` -- Resource detail view

### 5. Routing Updates

Add routes in `App.tsx`:
- `/projects` -- ProjectsPage
- `/projects/:id` -- ProjectDetailPage
- `/templates` -- TemplatesPage
- `/templates/:id` -- TemplateBuilderPage

### 6. Navigation Updates

- Add "Projects" entry to Admin Controls module grid in `AdminControls.tsx`
- Optionally add to bottom navigation or More page

## Implementation Approach

Due to the massive size of this module (~30+ files, ~5000+ lines of code, 20+ database tables), implementation will be done in phases:

**Phase 1:** Database migration (all tables, enums, RLS, storage bucket)
**Phase 2:** Hooks (`useProjects.ts`, `useTemplates.ts`) adapted for this project (no `useAuth`, use direct `supabase.auth.getUser()`)
**Phase 3:** Core components (CreateProjectModal, KanbanBoard, TaskDetailPanel, TaskStatusBadge, MultiUserPicker)
**Phase 4:** Pages (ProjectsPage, ProjectDetailPage) and routing
**Phase 5:** Remaining components (Gantt, Calendar, Backlog, Sprints, Milestones, Risks, Timesheet, Resources)
**Phase 6:** Template system components and AI features
**Phase 7:** Navigation integration

## Technical Details

```text
Staging Structure:
src/
  hooks/
    useProjects.ts (755 lines - all PM CRUD hooks)
    useTemplates.ts (~300 lines - template CRUD hooks)
  components/pm/
    29 component files
  pages/pm/
    5 page files

Current Project Adaptation:
- Replace useAuth() → supabase.auth.getUser()
- Replace <Layout> wrapper → use existing AppLayout (already via routes)
- All foreign keys reference profiles.id (already exists in current project)
- Storage bucket pm-attachments needs creation
```

**Estimated total:** ~20+ database tables, ~36 new files, ~8000+ lines of code

