import type { Doctor } from '@/types/doctor'

export const MOCK_DOCTORS: Doctor[] = [
  { id: 'D-2001', name: 'Dr. Priya Nair', specialization: 'Interventional Cardiologist', department: 'Cardiology', email: 'priya.nair@medicore.com', phone: '+1 555-0201', experienceYears: 14, status: 'available' },
  { id: 'D-2002', name: 'Dr. Marcus Webb', specialization: 'Neurosurgeon', department: 'Neurology', email: 'marcus.webb@medicore.com', phone: '+1 555-0202', experienceYears: 19, status: 'in-surgery' },
  { id: 'D-2003', name: 'Dr. Lianne Foster', specialization: 'Orthopedic Surgeon', department: 'Orthopedics', email: 'lianne.foster@medicore.com', phone: '+1 555-0203', experienceYears: 11, status: 'available' },
  { id: 'D-2004', name: 'Dr. Amara Okafor', specialization: 'Pediatrician', department: 'Pediatrics', email: 'amara.okafor@medicore.com', phone: '+1 555-0204', experienceYears: 8, status: 'available' },
  { id: 'D-2005', name: 'Dr. Hiro Tanaka', specialization: 'Dermatologist', department: 'Dermatology', email: 'hiro.tanaka@medicore.com', phone: '+1 555-0205', experienceYears: 6, status: 'on-leave' },
  { id: 'D-2006', name: 'Dr. Elena Popescu', specialization: 'General Physician', department: 'General Medicine', email: 'elena.popescu@medicore.com', phone: '+1 555-0206', experienceYears: 22, status: 'available' },
  { id: 'D-2007', name: 'Dr. Samuel Reyes', specialization: 'Emergency Medicine Specialist', department: 'Emergency', email: 'samuel.reyes@medicore.com', phone: '+1 555-0207', experienceYears: 9, status: 'available' },
  { id: 'D-2008', name: 'Dr. Grace Kim', specialization: 'Radiologist', department: 'Radiology', email: 'grace.kim@medicore.com', phone: '+1 555-0208', experienceYears: 13, status: 'available' },
  { id: 'D-2009', name: 'Dr. Idris Bello', specialization: 'Cardiac Electrophysiologist', department: 'Cardiology', email: 'idris.bello@medicore.com', phone: '+1 555-0209', experienceYears: 17, status: 'in-surgery' },
  { id: 'D-2010', name: 'Dr. Naomi Carter', specialization: 'Pediatric Neurologist', department: 'Neurology', email: 'naomi.carter@medicore.com', phone: '+1 555-0210', experienceYears: 10, status: 'available' },
  { id: 'D-2011', name: 'Dr. Felix Grant', specialization: 'Sports Medicine Surgeon', department: 'Orthopedics', email: 'felix.grant@medicore.com', phone: '+1 555-0211', experienceYears: 15, status: 'on-leave' },
  { id: 'D-2012', name: 'Dr. Yuki Sato', specialization: 'Dermatopathologist', department: 'Dermatology', email: 'yuki.sato@medicore.com', phone: '+1 555-0212', experienceYears: 7, status: 'available' },
]
