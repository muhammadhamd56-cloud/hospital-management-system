import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { MedicalRecordList } from '@/features/medicalRecords/MedicalRecordList'
import { useMyMedicalRecords } from '@/features/patientMedicalRecords/useMyMedicalRecords'

export function PatientMedicalRecordsCard() {
  const { records, isLoading } = useMyMedicalRecords()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Medical records</CardTitle>
        <CardDescription>Diagnoses and prescriptions from your care team.</CardDescription>
      </CardHeader>
      <CardContent>
        <MedicalRecordList
          records={records}
          isLoading={isLoading}
          emptyDescription="Once a doctor adds a diagnosis, it'll show up here."
        />
      </CardContent>
    </Card>
  )
}
