      PROGRAM XROTOR_DRIVER
      CHARACTER*32 COMMAND
C
      CALL GETARG(1,COMMAND)
C
      IF(COMMAND.EQ.'atmo' .OR. COMMAND.EQ.'ATMO') THEN
        CALL RUNATMO
      ELSEIF(COMMAND.EQ.'setx' .OR. COMMAND.EQ.'SETX') THEN
        CALL RUNSETX
      ELSEIF(COMMAND.EQ.'tinvrt' .OR. COMMAND.EQ.'TINVRT') THEN
        CALL RUNTINVRT
      ELSEIF(COMMAND.EQ.'uvadd' .OR. COMMAND.EQ.'UVADD') THEN
        CALL RUNUVADD
      ELSEIF(COMMAND.EQ.'cproj' .OR. COMMAND.EQ.'CPROJ') THEN
        CALL RUNCPROJ
      ELSEIF(COMMAND.EQ.'getvel' .OR. COMMAND.EQ.'GETVEL') THEN
        CALL RUNGETVEL
      ELSEIF(COMMAND.EQ.'savvel' .OR. COMMAND.EQ.'SAVVEL') THEN
        CALL RUNSAVVEL
      ELSEIF(COMMAND.EQ.'nacell' .OR. COMMAND.EQ.'NACELL') THEN
        CALL RUNNACELL
      ELSE
        WRITE(*,*) 'unknown command'
        STOP 1
      ENDIF
C
      END


      SUBROUTINE RUNATMO
      REAL ALSPEC, VSOALT, RHOALT, RMUALT
C
      READ(*,*) ALSPEC
      CALL ATMO(ALSPEC,VSOALT,RHOALT,RMUALT)
C
      WRITE(*,'(A)') 'RESULT ATMO'
      CALL WREAL(VSOALT)
      CALL WREAL(RHOALT)
      CALL WREAL(RMUALT)
      RETURN
      END


      SUBROUTINE RUNSETX
      INCLUDE 'XROTOR.INC'
      INTEGER I
C
      READ(*,*) II
      READ(*,*) XI0
      READ(*,*) XITIP
      READ(*,*) IXSPAC
C
      CALL SETX
C
      WRITE(*,'(A)') 'RESULT SETX'
      CALL WINT(II)
      CALL WREAL(DT)
      DO I=1, II
        CALL WREAL(T(I))
      ENDDO
      DO I=1, II
        CALL WREAL(XI(I))
      ENDDO
      DO I=1, II
        CALL WREAL(DXI(I))
      ENDDO
      DO I=1, II+1
        CALL WREAL(XV(I))
      ENDDO
      RETURN
      END


      SUBROUTINE RUNTINVRT
      INCLUDE 'XROTOR.INC'
      REAL XX, TT
C
      READ(*,*) II
      READ(*,*) XI0
      READ(*,*) XITIP
      READ(*,*) IXSPAC
      READ(*,*) XX
C
      TT = TINVRT(XX)
C
      WRITE(*,'(A)') 'RESULT TINVRT'
      CALL WREAL(TT)
      RETURN
      END


      SUBROUTINE RUNUVADD
      INCLUDE 'XROTOR.INC'
      REAL XIW, WA, WT
C
      READ(*,*) NADD
      READ(*,*) RAD
      READ(*,*) VEL
      IF(NADD.GT.0) THEN
        CALL READVEC(RADD,NADD)
        CALL READVEC(UADD,NADD)
        CALL READVEC(VADD,NADD)
        CALL READVEC(UADDR,NADD)
        CALL READVEC(VADDR,NADD)
      ENDIF
      READ(*,*) XIW
C
      CALL UVADD(XIW,WA,WT)
C
      WRITE(*,'(A)') 'RESULT UVADD'
      CALL WREAL(WA)
      CALL WREAL(WT)
      RETURN
      END


      SUBROUTINE RUNCPROJ
      INCLUDE 'XROTOR.INC'
      INTEGER I
      INTEGER K
C
      READ(*,*) II
      READ(*,*) ADV
      CALL READVEC(XI,II)
      CALL READVEC(DXI,II)
      CALL READVEC(CH,II)
      DO K=1, 3
        DO I=1, II
          READ(*,*) VIND(K,I)
        ENDDO
      ENDDO
C
      CALL CPROJ
      WRITE(*,'(A)') 'RESULT CPROJ'
      RETURN
      END


      SUBROUTINE RUNGETVEL
      INCLUDE 'XROTOR.INC'
      CHARACTER*256 FNAME1
      REAL ASKQ(2)
      INTEGER I
C
      READ(*,1000) FNAME1
      READ(*,*) ASKQ(1)
      READ(*,*) ASKQ(2)
      LUTEMP = 31
      NADD = 0
      CALL SETASKRQ(2,ASKQ)
C
      CALL GETVEL(FNAME1)
C
      WRITE(*,'(A)') 'RESULT GETVEL'
      CALL WINT(NADD)
      DO I=1, NADD
        CALL WREAL(RADD(I))
      ENDDO
      DO I=1, NADD
        CALL WREAL(UADD(I))
      ENDDO
      DO I=1, NADD
        CALL WREAL(VADD(I))
      ENDDO
      DO I=1, NADD
        CALL WREAL(UADDR(I))
      ENDDO
      DO I=1, NADD
        CALL WREAL(VADDR(I))
      ENDDO
      RETURN
C
 1000 FORMAT(A)
      END


      SUBROUTINE RUNSAVVEL
      INCLUDE 'XROTOR.INC'
      CHARACTER*256 FNAME1
C
      READ(*,*) II
      READ(*,*) RAD
      READ(*,*) VEL
      READ(*,*) ADV
      READ(*,*) ADW
      READ(*,*) URDUCT
      READ(*,*) NBLDS
      READ(*,*) IDUCT
      READ(*,*) ICONV
      READ(*,*) NADD
      DUCT = IDUCT .NE. 0
      CONV = ICONV .NE. 0
      CALL READVEC(XI,II)
      CALL READVEC(GAM,II)
      CALL READVEC(UBODY,II)
      IF(NADD.GT.0) THEN
        CALL READVEC(RADD,NADD)
        CALL READVEC(UADD,NADD)
        CALL READVEC(VADD,NADD)
        CALL READVEC(UADDR,NADD)
        CALL READVEC(VADDR,NADD)
      ENDIF
      LUTEMP = 32
      READ(*,1000) FNAME1
C
      CALL SAVVEL(FNAME1)
C
      WRITE(*,'(A)') 'RESULT SAVVEL'
      RETURN
C
 1000 FORMAT(A)
      END


      SUBROUTINE RUNNACELL
      INCLUDE 'XROTOR.INC'
      CHARACTER*256 FNAME1
      REAL ASKQ(1)
      INTEGER I
      INTEGER J
      INTEGER K
C
      READ(*,1000) FNAME1
      READ(*,*) ASKQ(1)
      READ(*,*) II
      READ(*,*) RAD
      READ(*,*) IDUCT
      READ(*,*) URDUCT
      DUCT = IDUCT .NE. 0
      CALL READVEC(XI,II)
      CALL READVEC(DXI,II)
      DO I=1, II
        UBODY(I) = 0.0
        VBODY(I) = 0.0
        XW(I) = 0.0
        DXW(I) = 0.0
        VWAK(I) = 0.0
        XW_ADV(I) = 0.0
        XW_ADW(I) = 0.0
        DXW_ADV(I) = 0.0
        DXW_ADW(I) = 0.0
        VW_ADV(I) = 0.0
        VW_ADW(I) = 0.0
      ENDDO
      DO K=1, 3
        DO I=1, II
          VIND(K,I) = 0.0
          VIND_ADW(K,I) = 0.0
          DO J=1, II
            VIND_GAM(K,I,J) = 0.0
          ENDDO
        ENDDO
      ENDDO
      XW0 = 0.0
      LUTEMP = 33
      CALL SETASKRQ(1,ASKQ)
C
      CALL NACELL(FNAME1)
C
      WRITE(*,'(A)') 'RESULT NACELL'
      CALL WINT(II)
      CALL WREAL(XW0)
      DO I=1, II
        CALL WREAL(UBODY(I))
      ENDDO
      DO I=1, II
        CALL WREAL(VBODY(I))
      ENDDO
      DO I=1, II
        CALL WREAL(XW(I))
      ENDDO
      DO I=1, II
        CALL WREAL(DXW(I))
      ENDDO
      RETURN
C
 1000 FORMAT(A)
      END


      SUBROUTINE READVEC(A,N)
      REAL A(*)
      INTEGER N
      INTEGER I
C
      DO I=1, N
        READ(*,*) A(I)
      ENDDO
      RETURN
      END


      SUBROUTINE WREAL(X)
      REAL X
C
      WRITE(*,1000) X
      RETURN
C
 1000 FORMAT(1PE24.16)
      END


      SUBROUTINE WINT(I)
      INTEGER I
C
      WRITE(*,1000) I
      RETURN
C
 1000 FORMAT(I12)
      END


      SUBROUTINE SETASKRQ(N,VALUES)
      INTEGER N
      REAL VALUES(*)
      INTEGER NASKR
      INTEGER IASKR
      REAL ASKRVAL(20)
      INTEGER I
      COMMON /ASKQ_XROT/ NASKR, IASKR, ASKRVAL
C
      NASKR = N
      IASKR = 0
      DO I=1, 20
        ASKRVAL(I) = 0.0
      ENDDO
      DO I=1, N
        ASKRVAL(I) = VALUES(I)
      ENDDO
      RETURN
      END


      SUBROUTINE ASKR(PROMPT,RINPUT)
      CHARACTER*(*) PROMPT
      REAL RINPUT
      INTEGER NASKR
      INTEGER IASKR
      REAL ASKRVAL(20)
      COMMON /ASKQ_XROT/ NASKR, IASKR, ASKRVAL
C
      IF(IASKR .LT. NASKR) THEN
        IASKR = IASKR + 1
        RINPUT = ASKRVAL(IASKR)
      ELSE
        RINPUT = 0.0
      ENDIF
      RETURN
      END


      SUBROUTINE ASKS(PROMPT,INPUT)
      CHARACTER*(*) PROMPT
      CHARACTER*(*) INPUT
C
      INPUT = ' '
      RETURN
      END


      SUBROUTINE LC2UC(INPUT)
      CHARACTER*(*) INPUT
      INTEGER I
      INTEGER J
      INTEGER L
C
      L = LEN(INPUT)
      DO I=1, L
        J = ICHAR(INPUT(I:I))
        IF(J.GE.97 .AND. J.LE.122) THEN
          INPUT(I:I) = CHAR(J-32)
        ENDIF
      ENDDO
      RETURN
      END


      SUBROUTINE PLTINI(SCRNFR,IPSLU,IDEV,FACTOR,LPLOT,LLAND)
      REAL SCRNFR
      INTEGER IPSLU
      INTEGER IDEV
      REAL FACTOR
      LOGICAL LPLOT
      LOGICAL LLAND
C
      RETURN
      END


      SUBROUTINE PLOTABS(X,Y,IPEN)
      REAL X
      REAL Y
      INTEGER IPEN
C
      RETURN
      END


      SUBROUTINE NACPLT(NB,ZB,RB,ZPROP,RW,N,R,U)
      INTEGER NB
      INTEGER N
      REAL ZB(*)
      REAL RB(*)
      REAL ZPROP
      REAL RW
      REAL R(*)
      REAL U(*)
C
      RETURN
      END
