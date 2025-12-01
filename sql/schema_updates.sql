-- Database Schema Updates for Semester Management
-- Run this script to ensure users table has semester fields

-- Add semester fields to users table if they don't exist
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS semester_id INT NULL,
ADD COLUMN IF NOT EXISTS semester_verified BOOLEAN DEFAULT 0,
ADD COLUMN IF NOT EXISTS semester_verified_at TIMESTAMP NULL,
ADD COLUMN IF NOT EXISTS profile_image VARCHAR(500) NULL,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- Add foreign key constraint for semester_id
ALTER TABLE users 
ADD CONSTRAINT fk_users_semester 
FOREIGN KEY (semester_id) REFERENCES semesters(semester_id) 
ON DELETE SET NULL ON UPDATE CASCADE;

-- Create semesters table if it doesn't exist
CREATE TABLE IF NOT EXISTS semesters (
  semester_id INT PRIMARY KEY AUTO_INCREMENT,
  semester_name VARCHAR(100) NOT NULL,
  school_year VARCHAR(20) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_semester (semester_name, school_year)
);

-- Create departments table if it doesn't exist
CREATE TABLE IF NOT EXISTS departments (
  department_id INT PRIMARY KEY AUTO_INCREMENT,
  department_name VARCHAR(200) NOT NULL,
  department_acronym VARCHAR(20) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_department_name (department_name)
);

-- Add foreign key constraint for department_id if it doesn't exist
ALTER TABLE users 
ADD CONSTRAINT fk_users_department 
FOREIGN KEY (department_id) REFERENCES departments(department_id) 
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Create system_settings table if it doesn't exist
CREATE TABLE IF NOT EXISTS system_settings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  student_max_book INT DEFAULT 3,
  student_borrow_days INT DEFAULT 3,
  faculty_max_books INT DEFAULT 5,
  faculty_borrow_days INT DEFAULT 90,
  student_daily_fine DECIMAL(10,2) DEFAULT 5.00,
  faculty_daily_fine DECIMAL(10,2) DEFAULT 10.00,
  kiosk_prevent_borrow BOOLEAN DEFAULT 0,
  kiosk_pin VARCHAR(6) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insert default system settings if not exists
INSERT IGNORE INTO system_settings (id) VALUES (1);

-- Create indexes for better performance (MySQL compatible)
CREATE INDEX idx_users_semester ON users(semester_id);
CREATE INDEX idx_users_department ON users(department_id);
CREATE INDEX idx_users_position ON users(position);
CREATE INDEX idx_users_verification ON users(semester_verified);
CREATE INDEX idx_semesters_active ON semesters(is_active);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_student_id ON users(student_id);
CREATE INDEX idx_users_faculty_id ON users(faculty_id);