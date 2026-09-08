INSERT INTO divisions(id,division_key,name,is_government) VALUES
('10000000-0000-4000-8000-000000000001','powerinai','PowerInAI',FALSE),
('10000000-0000-4000-8000-000000000002','powerinai-training','PowerInAI Training',FALSE),
('10000000-0000-4000-8000-000000000003','government-projects','Government Projects',TRUE),
('10000000-0000-4000-8000-000000000004','computer-jagat','Computer Jagat',FALSE),
('10000000-0000-4000-8000-000000000005','westerncf','WesternCF',FALSE)
ON DUPLICATE KEY UPDATE name=VALUES(name),is_government=VALUES(is_government);

INSERT INTO roles(id,role_key,name) VALUES
('20000000-0000-4000-8000-000000000001','super_admin','Super Administrator'),
('20000000-0000-4000-8000-000000000002','team_lead','Team Lead'),
('20000000-0000-4000-8000-000000000003','employee','Employee'),
('20000000-0000-4000-8000-000000000004','hr_manager','HR Manager'),
('20000000-0000-4000-8000-000000000005','finance_manager','Finance Manager'),
('20000000-0000-4000-8000-000000000006','management','Management/View-Only')
ON DUPLICATE KEY UPDATE name=VALUES(name);

INSERT INTO permissions(id,permission_key,name,sensitivity) VALUES
('21000000-0000-4000-8000-000000000001','time.own.manage','Manage own time','normal'),
('21000000-0000-4000-8000-000000000002','time.team.review','Review team exceptions','protected'),
('21000000-0000-4000-8000-000000000003','period.verify','Verify payroll periods','protected'),
('21000000-0000-4000-8000-000000000004','finance.cost.view','View labour cost','financial'),
('21000000-0000-4000-8000-000000000005','government.view','View government projects','government'),
('21000000-0000-4000-8000-000000000006','audit.view','View audit evidence','protected')
ON DUPLICATE KEY UPDATE name=VALUES(name),sensitivity=VALUES(sensitivity);

INSERT IGNORE INTO role_permissions(role_id,permission_id) VALUES
('20000000-0000-4000-8000-000000000003','21000000-0000-4000-8000-000000000001'),
('20000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000002'),
('20000000-0000-4000-8000-000000000004','21000000-0000-4000-8000-000000000003'),
('20000000-0000-4000-8000-000000000005','21000000-0000-4000-8000-000000000004'),
('20000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000005'),
('20000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000006');

INSERT INTO users(id,name,email,email_normalized,employee_identifier,status) VALUES
('30000000-0000-4000-8000-000000000001','Amina Rahman','admin@powerin.ai','admin@powerin.ai','ADM-001','active'),
('30000000-0000-4000-8000-000000000002','Tanvir Hasan','lead@powerin.ai','lead@powerin.ai','TL-001','active'),
('30000000-0000-4000-8000-000000000003','Nadia Islam','employee@powerin.ai','employee@powerin.ai','EMP-001','active'),
('30000000-0000-4000-8000-000000000004','Farhana Akter','hr@powerin.ai','hr@powerin.ai','HR-001','active'),
('30000000-0000-4000-8000-000000000005','Imran Chowdhury','finance@powerin.ai','finance@powerin.ai','FIN-001','active'),
('30000000-0000-4000-8000-000000000006','Rafiq Ahmed','management@powerin.ai','management@powerin.ai','MGT-001','active'),
('30000000-0000-4000-8000-000000000007','Sadia Karim','sadia@powerin.ai','sadia@powerin.ai','EMP-002','active'),
('30000000-0000-4000-8000-000000000008','Mahmud Alam','mahmud@powerin.ai','mahmud@powerin.ai','EMP-003','active'),
('30000000-0000-4000-8000-000000000009','Jannat Noor','jannat@powerin.ai','jannat@powerin.ai','EMP-004','active'),
('30000000-0000-4000-8000-000000000010','Arif Hossain','arif@powerin.ai','arif@powerin.ai','EMP-005','active'),
('30000000-0000-4000-8000-000000000011','Maliha Sultana','maliha@powerin.ai','maliha@powerin.ai','EMP-006','active')
ON DUPLICATE KEY UPDATE name=VALUES(name),status=VALUES(status);

INSERT INTO employees(id,user_id,employee_code,display_name,job_title,hire_date) SELECT CONCAT('40000000-0000-4000-8000-',LPAD(CAST(n AS CHAR),12,'0')),CONCAT('30000000-0000-4000-8000-',LPAD(CAST(n AS CHAR),12,'0')),employee_code,name,CASE WHEN n=2 THEN 'Team Lead' WHEN n=4 THEN 'HR Manager' WHEN n=5 THEN 'Finance Manager' ELSE 'Software Professional' END,'2024-01-01' FROM (SELECT 1 n,'ADM-001' employee_code UNION ALL SELECT 2,'TL-001' UNION ALL SELECT 3,'EMP-001' UNION ALL SELECT 4,'HR-001' UNION ALL SELECT 5,'FIN-001' UNION ALL SELECT 6,'MGT-001' UNION ALL SELECT 7,'EMP-002' UNION ALL SELECT 8,'EMP-003' UNION ALL SELECT 9,'EMP-004' UNION ALL SELECT 10,'EMP-005' UNION ALL SELECT 11,'EMP-006') seed JOIN users u ON u.employee_identifier=seed.employee_code ON DUPLICATE KEY UPDATE display_name=VALUES(display_name),job_title=VALUES(job_title);

INSERT IGNORE INTO user_roles(id,user_id,role_id,effective_from) VALUES
('50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','2026-01-01'),
('50000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','2026-01-01'),
('50000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','2026-01-01'),
('50000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000004','2026-01-01'),
('50000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000005','2026-01-01'),
('50000000-0000-4000-8000-000000000006','30000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000006','2026-01-01');

INSERT INTO policy_versions(id,policy_key,version_number,effective_from,timezone,required_active_minutes,recognized_break_minutes,scheduled_minutes,overtime_limit_minutes,configuration) VALUES ('60000000-0000-4000-8000-000000000001','standard-day',1,'2026-01-01','Asia/Dhaka',420,60,480,720,JSON_OBJECT('crossMidnight','attribute_to_start_date')) ON DUPLICATE KEY UPDATE configuration=VALUES(configuration);
INSERT IGNORE INTO work_policies(id,division_id,policy_version_id,effective_from) VALUES ('61000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','2026-01-01');
INSERT IGNORE INTO holiday_calendars(id,name,effective_from) VALUES ('62000000-0000-4000-8000-000000000001','Bangladesh Company Calendar','2026-01-01');
INSERT IGNORE INTO holidays(id,calendar_id,holiday_date,name) VALUES ('62100000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001','2026-09-01','Demo Holiday');

INSERT IGNORE INTO employee_division_assignments(id,employee_id,division_id,lead_employee_id,effective_from,allocation_percent_basis_points,expected_weekly_minutes,is_primary) VALUES
('70000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',NULL,'2026-01-01',10000,2100,TRUE),
('70000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','2026-01-01',6000,2100,TRUE),
('70000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000002','2026-01-01',2000,2100,FALSE),
('70000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000005','40000000-0000-4000-8000-000000000002','2026-01-01',2000,2100,FALSE);

INSERT INTO projects(id,division_id,project_code,name,status,manager_employee_id,estimated_minutes,deadline,priority,budget_amount,currency) VALUES
('80000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','PIAI-CRM','Internal CRM','active','40000000-0000-4000-8000-000000000002',12000,'2026-12-31','high','800000.0000','BDT'),
('80000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','GOV-PORTAL','Government Portal','active','40000000-0000-4000-8000-000000000002',24000,'2027-03-31','critical','2500000.0000','BDT'),
('80000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000005','WCF-WEB','WesternCF Website','active','40000000-0000-4000-8000-000000000002',8000,'2026-11-30','normal','450000.0000','BDT')
ON DUPLICATE KEY UPDATE name=VALUES(name),status=VALUES(status);
INSERT IGNORE INTO tasks(id,project_id,division_id,title,status,assignee_employee_id,creator_employee_id,creator_role,review_state,estimated_minutes,due_date) VALUES
('81000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Implement dashboard','in_progress','40000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000002','team_lead','not_required',1200,'2026-09-15'),
('81000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','Secure reporting endpoint','pending','40000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000002','team_lead','not_required',900,'2026-09-20'),
('81000000-0000-4000-8000-000000000003','80000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000005','Responsive content pages','pending','40000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000002','team_lead','not_required',600,'2026-09-22');

INSERT INTO timesheet_periods(id,label,start_date,end_date,status,policy_version_id,verified_at,verified_by_user_id) VALUES
('90000000-0000-4000-8000-000000000001','August 2026','2026-08-01','2026-08-31','verified','60000000-0000-4000-8000-000000000001','2026-09-01 10:00:00','30000000-0000-4000-8000-000000000004'),
('90000000-0000-4000-8000-000000000002','September 2026','2026-09-01','2026-09-30','open','60000000-0000-4000-8000-000000000001',NULL,NULL)
ON DUPLICATE KEY UPDATE label=VALUES(label),status=VALUES(status);
INSERT IGNORE INTO period_verifications(id,period_id,verified_by_user_id,verified_at,policy_version_id,snapshot_hash) VALUES ('90100000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000004','2026-09-01 10:00:00','60000000-0000-4000-8000-000000000001',REPEAT('a',64));

INSERT IGNORE INTO time_entries(id,employee_id,work_date,division_id,project_id,task_id,policy_version_id,timezone,entry_method,work_location,start_at_utc,end_at_utc,active_minutes,work_description,completed_work,overtime_reason,critical_explanation,status,created_by_user_id) VALUES
('a0000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003','2026-09-02','10000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','Asia/Dhaka','manual_clock','office','2026-09-02 03:00:00','2026-09-02 06:00:00',180,'Dashboard','Completed summary cards',NULL,NULL,'saved','30000000-0000-4000-8000-000000000003'),
('a0000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000003','2026-09-02','10000000-0000-4000-8000-000000000003','80000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000001','Asia/Dhaka','manual_duration','office',NULL,NULL,120,'Government report','Implemented safe query',NULL,NULL,'saved','30000000-0000-4000-8000-000000000003'),
('a0000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000003','2026-09-02','10000000-0000-4000-8000-000000000005','80000000-0000-4000-8000-000000000003','81000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000001','Asia/Dhaka','manual_duration','wfh',NULL,NULL,120,'Website work','Completed responsive page',NULL,NULL,'saved','30000000-0000-4000-8000-000000000003');
INSERT IGNORE INTO daily_breaks(id,employee_id,work_date,minutes,source,policy_version_id) VALUES ('a1000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003','2026-09-02',60,'policy','60000000-0000-4000-8000-000000000001');
INSERT INTO daily_summaries(id,employee_id,work_date,active_minutes,break_minutes,total_minutes,required_active_minutes,required_break_minutes,classification,timezone,policy_version_id,recalculated_at,source_version) VALUES
('a2000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003','2026-09-02',420,60,480,420,60,'complete','Asia/Dhaka','60000000-0000-4000-8000-000000000001','2026-09-02 18:00:00',1),
('a2000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000007','2026-09-02',419,60,479,420,60,'under_time','Asia/Dhaka','60000000-0000-4000-8000-000000000001','2026-09-02 18:00:00',1),
('a2000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000008','2026-09-02',500,60,560,420,60,'overtime','Asia/Dhaka','60000000-0000-4000-8000-000000000001','2026-09-02 18:00:00',1),
('a2000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000009','2026-09-02',700,60,760,420,60,'critical','Asia/Dhaka','60000000-0000-4000-8000-000000000001','2026-09-02 18:00:00',1),
('a2000000-0000-4000-8000-000000000005','40000000-0000-4000-8000-000000000010','2026-09-02',0,0,0,420,60,'missing','Asia/Dhaka','60000000-0000-4000-8000-000000000001','2026-09-02 18:00:00',1)
ON DUPLICATE KEY UPDATE active_minutes=VALUES(active_minutes),break_minutes=VALUES(break_minutes),total_minutes=VALUES(total_minutes),classification=VALUES(classification),source_version=VALUES(source_version);

INSERT IGNORE INTO wfh_requests(id,employee_id,division_id,wfh_date,portion,reason,planned_tasks,contact_availability,status) VALUES ('b0000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','2026-09-03','full_day','Focused delivery','Dashboard and tests','Online 09:00-18:00','approved');
INSERT IGNORE INTO leave_types(id,type_key,name,is_paid) VALUES ('b1000000-0000-4000-8000-000000000001','annual','Annual Leave',TRUE);
INSERT INTO leave_balances(id,employee_id,leave_type_id,year,entitled_minutes,used_minutes) VALUES ('b2000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000001',2026,8400,420) ON DUPLICATE KEY UPDATE entitled_minutes=VALUES(entitled_minutes),used_minutes=VALUES(used_minutes);
INSERT IGNORE INTO leave_requests(id,employee_id,leave_type_id,start_date,end_date,portion,requested_minutes,reason,status) VALUES ('b3000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000001','2026-09-10','2026-09-10','full_day',420,'Personal leave','approved');
INSERT IGNORE INTO general_remarks(id,employee_id,author_user_id,message,related_type,related_id,is_correction_request,requested_changes,status) VALUES ('b4000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000002','Please correct the project allocation','time_entry','a0000000-0000-4000-8000-000000000001',TRUE,'Move 30 minutes to the government project','open');

INSERT IGNORE INTO evaluation_periods(id,label,start_date,end_date,status,weights) VALUES ('c0000000-0000-4000-8000-000000000001','Q3 2026','2026-07-01','2026-09-30','open',JSON_OBJECT('delivery',5000,'quality',3000,'collaboration',2000));
INSERT IGNORE INTO evaluations(id,period_id,employee_id,reviewer_employee_id,status) VALUES ('c1000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000002','draft');
INSERT IGNORE INTO cost_rates(id,employee_id,rate_amount,currency,rate_unit,effective_from) VALUES ('c2000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003','1200.0000','BDT','hour','2026-01-01');
INSERT IGNORE INTO budgets(id,project_id,period_start,period_end,amount,currency) VALUES ('c3000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','2026-01-01','2026-12-31','800000.0000','BDT');
INSERT IGNORE INTO payroll_periods(id,label,start_date,end_date,timesheet_period_id,status) VALUES ('c4000000-0000-4000-8000-000000000001','August 2026 Payroll','2026-08-01','2026-08-31','90000000-0000-4000-8000-000000000001','ready');
INSERT INTO report_definitions(id,report_key,name,module,required_permission,configuration) VALUES
('c5000000-0000-4000-8000-000000000001','employee-hours','Employee Hours','timesheet',NULL,JSON_OBJECT('groupBy','employee')),
('c5000000-0000-4000-8000-000000000002','labour-cost','Labour Cost','finance','finance.cost.view',JSON_OBJECT('groupBy','project'))
ON DUPLICATE KEY UPDATE name=VALUES(name),configuration=VALUES(configuration);
