      PROGRAM PORTAUDIT
      INCLUDE 'XROTOR.INC'
      CHARACTER*16 COMMAND
      CHARACTER*16 ARG
      INTEGER IDUCT, ISTRUC, IADD
      CALL GETARG(1,COMMAND)
      IF(COMMAND.EQ.'design') THEN
        CALL AUDITDES
        STOP
      ENDIF
C     Exercise the real STLOAD -> CSCALC -> UVADD dependency chain.
      CALL SETDEF
      IDUCT = 0
      ISTRUC = 0
      IADD = 0
      CALL GETARG(2,ARG)
      IF(LEN_TRIM(ARG).GT.0) READ(ARG,*) IDUCT
      CALL GETARG(3,ARG)
      IF(LEN_TRIM(ARG).GT.0) READ(ARG,*) ISTRUC
      CALL GETARG(4,ARG)
      IF(LEN_TRIM(ARG).GT.0) READ(ARG,*) IADD
      II = 4
      RAD = 1.4
      VEL = 45.0
      RHO = 1.225
      ADV = 0.7
      RAKE = 0.05
      DUCT = IDUCT.NE.0
      LSTRUC = ISTRUC.NE.0
      URDUCT = 1.15
      NADD = 0
      IF(IADD.NE.0) THEN
        NADD = 3
        DO I = 1, NADD
          RADD(I) = 0.2 + 0.5*(I-1)
          UADD(I) = 0.02 + 0.03*I
          VADD(I) = -0.01*I
        ENDDO
        CALL SPLINE(UADD,UADDR,RADD,NADD)
        CALL SPLINE(VADD,VADDR,RADD,NADD)
      ENDIF
      DO I = 1, II
        XI(I) = 0.2 + 0.18*I
        DXI(I) = 0.18
        CH(I) = 0.2
        BETA(I) = 0.5
        BETA0(I) = BETA(I)
        CL(I) = 0.6
        CD(I) = 0.02
        CM(I) = -0.05
        UBODY(I) = 0.01
        DO K = 1, 3
          VIND(K,I) = 0.0
          VIND_ADW(K,I) = 0.0
        ENDDO
        VIND(1,I) = 0.08
        VIND(3,I) = 0.03
        EIXXB(I) = 1.35E5
        EIYYB(I) = 1.72E5
        EAB(I) = 3.2E7
        GJB(I) = 8.5E4
        EKB(I) = 1.2E3
        MB(I) = 0.71
        MXXB(I) = 0.023
        XOCG(I) = 0.305
        XOSC(I) = 0.281
        RSTB(I) = 0.046
      ENDDO
      DO I = 1, II+1
        TX(I) = 0.0
        TZ(I) = 0.0
        WZ(I) = 0.0
      ENDDO
      IF(COMMAND.EQ.'coupled') THEN
        NBLDS = 3
        XI0 = 0.2
        XITIP = 1.0
        XW0 = 0.2
        FREE = .TRUE.
        FAST = .TRUE.
        NITERA = 40
        ADWFCTR = 1.0
        CALL SETX
        DO I = 1, II
          BETA(I) = ATAN2(ADV,XI(I)) + 0.07
          BETA0(I) = BETA(I)
        ENDDO
        CALL APER(4,2,.TRUE.)
        IF(.NOT.CONV) STOP 2
      ENDIF
      IF(COMMAND.EQ.'stcalc'.OR.COMMAND.EQ.'coupled') THEN
        CALL STCALC
      ELSE
        CALL STLOAD
      ENDIF
      WRITE(*,'(A)') 'RESULT STLOAD'
      DO I = 1, II
        WRITE(*,'(15(ES24.16E3,1X))') PX(I),PY(I),PZ(I),
     &    MX(I),MY(I),MZ(I),PX_TY(I),PX_TZ(I),PZ_TX(I),PZ_TY(I),
     &    PZ_WZ(I),MY_TY(I),MZ_TY(I),MZ_TX(I),MZ_WZ(I)
      ENDDO
      DO I = 1, II+1
        WRITE(*,'(12(ES24.16E3,1X))') TX(I),TY(I),TZ(I),
     &    WX(I),WY(I),WZ(I),SHRX(I),SHRY(I),SHRZ(I),
     &    MOMX(I),MOMY(I),MOMZ(I)
      ENDDO
      WRITE(*,'(2(ES24.16E3,1X))') RMS,RLX
      END

      SUBROUTINE AUDITDES
      INCLUDE 'XROTOR.INC'
      CHARACTER*16 ARG
      INTEGER IPOWER, IWIND, IDUCT, IFREE
      CALL SETDEF
      IPOWER = 0
      IWIND = 0
      IDUCT = 0
      IFREE = 1
      CALL GETARG(3,ARG)
      IF(LEN_TRIM(ARG).GT.0) READ(ARG,*) IPOWER
      CALL GETARG(4,ARG)
      IF(LEN_TRIM(ARG).GT.0) READ(ARG,*) IWIND
      CALL GETARG(5,ARG)
      IF(LEN_TRIM(ARG).GT.0) READ(ARG,*) IDUCT
      CALL GETARG(6,ARG)
      IF(LEN_TRIM(ARG).GT.0) READ(ARG,*) IFREE
      II = 5
      NBLDS = 3
      FAST = .TRUE.
      FREE = IFREE.NE.0
      DUCT = IDUCT.NE.0
      WIND = IWIND.NE.0
      DEST = IPOWER.EQ.0
      DESP = IPOWER.NE.0
      NITERD = 40
      CALL GETARG(2,ARG)
      IF(LEN_TRIM(ARG).GT.0) READ(ARG,*) NITERD
      RAD = 1.4
      VEL = 45.0
      ADV = 0.7
      XI0 = 0.2
      XITIP = 1.0
      XW0 = 0.2
      URDUCT = 1.0
      ADWFCTR = 1.0
      SGN = 1.0
      IF(WIND) SGN = -1.0
      TDES = 0.0
      PDES = 0.0
      IF(DEST) TDES = SGN*180.0/(RHO*VEL**2*RAD**2)
      IF(DESP) PDES = SGN*9000.0/(RHO*VEL**3*RAD**2)
      CALL SETX
      CALL XWINIT
      CLINPUT = 0.6
      IF(WIND) CLINPUT = -0.35
      CALL GETARG(7,ARG)
      IF(LEN_TRIM(ARG).GT.0) READ(ARG,*) CLINPUT
      DO I = 1, II
        CL(I) = CLINPUT
      ENDDO
      EFFINV = 1.0
      IF(FREE.AND.DEST)
     & EFFINV = 0.5*SQRT(ABS(1.0+TDES*2.0/PI))+0.5
      IF(FREE.AND.DESP)
     & EFFINV = 0.25*SQRT(ABS(1.0+PDES*4.0/PI))+0.75
      ADW = EFFINV*ADV
      CALL DESINI
      RMS = 123.0
      RLX = 0.125
      DEFF = 0.0
      CALL GETARG(8,ARG)
      IF(LEN_TRIM(ARG).GT.0) READ(ARG,*) DEFF
      CALL DEITER(2)
      WRITE(*,'(A)') 'RESULT DESIGN'
      WRITE(*,'(4(ES24.16E3,1X))') RMS, RLX, TTOT, PTOT
      WRITE(*,*) CONV
      WRITE(*,'(4(ES24.16E3,1X))') ADW,EFFINV,TDES,PDES
      DO I = 1, II
        WRITE(*,'(8(ES24.16E3,1X))') CH(I),BETA(I),BETA0(I),
     &    GAM(I),CL(I),CD(I),CM(I),XW(I)
      ENDDO
      WRITE(*,'(6(ES24.16E3,1X))') TI_ADW,PI_ADW,TW_ADW,
     &    PW_ADW,TV_ADW,PV_ADW
      WRITE(*,'(ES24.16E3)') DEFF
      END
