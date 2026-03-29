-- CreateTable
CREATE TABLE "PatientCodeSequence" (
    "year" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PatientCodeSequence_pkey" PRIMARY KEY ("year")
);
