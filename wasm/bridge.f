      SUBROUTINE VRSOLVE(C,G,NG,MODE,R,S,H,NH)
      INCLUDE 'XROTOR.INC'
      REAL C(20),G(100,3),R(32),S(11,100),H(3,150)
      REAL GD(100,2),VRH(3,150)
      REAL SPA(1000),SPB(1000),SPC(1000)
      INTEGER NG,MODE,NH,VRN
      COMMON/VRHIST_X/ VRH,VRN
      COMMON/SPLCOM/ SPA,SPB,SPC
C     The caller clears COMMON storage before each independent solve.
      CALL SETDEF
      LUREAD = 5
      LUWRIT = 6
      LUTEMP = 35
      LUSAVE = 36
      NAME = 'VibeRotor WASM'
      NBLDS = INT(C(1))
      RAD = C(2)
      XI0 = C(3)
      XW0 = XI0
      XITIP = 1.0
      II = INT(C(12))
      IINF = II + II/2
      VEL = C(8)
      RHO = C(9)
      VSO = C(10)
      RMU = C(11)
      ADV = VEL/(RAD*C(7)*PI/30.0)
      FAST = INT(C(13)).EQ.0
      VRTX = INT(C(13)).EQ.2
      FREE = C(14).NE.0.0
      DUCT = C(15).NE.0.0
      URDUCT = C(16)
      NITERA = INT(C(17))
      NITERD = NITERA
      ADWFCTR = 1.0
      LOPRINI = .TRUE.
      LDESINI = .TRUE.
      TERSE = .TRUE.
      VRN = 0
      CALL SETX
      IF(NG.GT.0) THEN
        CALL SPLINE(G(1,2),GD(1,1),G(1,1),NG)
        CALL SPLINE(G(1,3),GD(1,2),G(1,1),NG)
      ENDIF
      HELIX = 0.75*TAN(C(6)*PI/180.0)
      DO I=1,II
        IF(NG.GT.0) THEN
          CH(I) = SEVAL(XI(I),G(1,2),GD(1,1),G(1,1),NG)/RAD
          BETA(I) = SEVAL(XI(I),G(1,3),GD(1,2),G(1,1),NG)
     &              *PI/180.0
        ELSE
          FRAC = (XI(I)-XI0)/(1.0-XI0)
          CH(I) = (C(4)+(C(5)-C(4))*FRAC)/RAD
          BETA(I) = ATAN2(HELIX,XI(I))
        ENDIF
        BETA0(I) = BETA(I)
        IF(CH(I).LE.0.0) THEN
          NH = -1
          RETURN
        ENDIF
      ENDDO
      IF(MODE.EQ.1) THEN
        RADDES = RAD
        R0DES = XI0*RAD
        RWDES = XW0*RAD
        VELDES = VEL
        ADVDES = ADV
        RPMDES = C(7)
        DEST = INT(C(18)).EQ.0
        DESP = .NOT.DEST
        IF(DEST) TDDES = C(19)
        IF(DESP) PDDES = C(19)
        CLDES0 = C(20)
        DO I=1,II
          CLDES(I) = CLDES0
        ENDDO
        CALL DESGEN
      ELSE
        CALL APER(4,2,.TRUE.)
      ENDIF
      CALL VRRESULT(R,S)
      NH = VRN
      DO I=1,NH
        DO J=1,3
          H(J,I) = VRH(J,I)
        ENDDO
      ENDDO
      END

      SUBROUTINE VRHIST(ITER,RESID,RELAX)
      REAL VRH(3,150),RESID,RELAX
      INTEGER ITER,VRN
      COMMON/VRHIST_X/ VRH,VRN
      IF(VRN.GE.150) RETURN
      VRN = VRN+1
      VRH(1,VRN) = ITER
      VRH(2,VRN) = RESID
      VRH(3,VRN) = RELAX
      END

      SUBROUTINE VRRESULT(R,S)
      INCLUDE 'XROTOR.INC'
      REAL R(32),S(11,100)
C     Dimensional output/scaling follows xrotor.f OUTPUT.
      TDIM = TTOT*RHO*VEL**2*RAD**2
      QDIM = QTOT*RHO*VEL**2*RAD**3
      PDIM = PTOT*RHO*VEL**3*RAD**2
      TVDIM = TVIS*RHO*VEL**2*RAD**2
      PVDIM = PVIS*RHO*VEL**3*RAD**2
      EFFTOT = TTOT/PTOT
      RPM = VEL/(RAD*ADV*PI/30.0)
      DIA = 2.0*RAD
      TNACEL = (TWAK-TINV)*RHO*VEL**2*RAD**2
      CALL SPLINE(CH,W1,XI,II)
      CH34 = SEVAL(0.75,CH,W1,XI,II)
      SIGMA = NBLDS*CH34/PI
      TC = TDIM/(0.5*RHO*VEL**2*PI*RAD**2)
      PC = PDIM/(0.5*RHO*VEL**3*PI*RAD**2)
      EN = RPM/60.0
      CT = TDIM/(RHO*EN**2*DIA**4)
      CP = PDIM/(RHO*EN**3*DIA**5)
      EFFIND = TWAK/PWAK
      TCLIM = MAX(-1.0,TC)
      EIDEAL = 2.0/(1.0+SQRT(TCLIM+1.0))
      R(1) = NBLDS
      R(2) = RAD
      R(3) = ADV
      R(4) = TDIM
      R(5) = PDIM
      R(6) = QDIM
      R(7) = EFFTOT
      R(8) = VEL
      R(9) = RPM
      R(10) = EFFIND
      R(11) = EIDEAL
      R(12) = TC
      R(13) = TNACEL
      R(14) = XI0*RAD
      R(15) = XW0*RAD
      R(16) = TVDIM
      R(17) = PVDIM
      R(18) = RHO
      R(19) = VSO
      R(20) = RMU
      R(21) = SIGMA
      R(22) = CT
      R(23) = CP
      R(24) = ADV*PI
      R(25) = PC
      R(26) = RMS
      R(27) = 0.0
      IF(CONV) R(27) = 1.0
      R(28) = IWTYP
      R(29) = ADW
      R(30) = TTOT
      R(31) = PTOT
      R(32) = QTOT
      DO I=1,II
        CALL CSCALC(I,UTOT,WA,WT,
     &              VT,VT_ADW,VA,VA_ADW,VD,VD_ADW,
     &              CI,CI_ADV,CI_VT,SI,SI_VA,
     &              W,W_ADV,W_VT,W_VA,PHI,P_ADV,P_VT,P_VA)
        S(1,I) = XI(I)
        S(2,I) = CH(I)*RAD
        S(3,I) = BETA(I)*180.0/PI
        S(4,I) = CL(I)
        S(5,I) = CD(I)
        S(6,I) = GAM(I)
        S(7,I) = W*VEL/VSO
        S(8,I) = RE(I)
        S(9,I) = VIND(1,I)*VEL
        S(10,I) = 0.0
        IF(STALL(I)) S(10,I) = 1.0
        S(11,I) = DXI(I)
      ENDDO
      END

      SUBROUTINE VRNOISE(OBS,TRACE,HARM,TOTAL)
      INCLUDE 'XROTOR.INC'
      REAL OBS(4),TRACE(0:80,2),HARM(40,3),TOTAL(3)
      REAL PCOMP(0:80,3),AOCI(IX)
C     Noninteractive pressure pipeline from xnoise.f lines 472-505.
      DO I=1,II
        AOCI(I) = OBS(4)
      ENDDO
      CALL PTRACE(OBS(1),OBS(2),OBS(3),
     &            NBLDS,II,XI,DXI,AOCI,CH,GAM,
     &            ADV,RAD,VEL,VSO,RHO,80,80,PCOMP,TRACE(0,1))
      DO IT=0,80
        TRACE(IT,2) = PCOMP(IT,1)+PCOMP(IT,2)+PCOMP(IT,3)
      ENDDO
      PRMS = 0.0
      DO IT=1,80
        DELT = TRACE(IT,1)-TRACE(IT-1,1)
        PAVG = (TRACE(IT,2)+TRACE(IT-1,2))*0.5
        PRMS = PRMS+PAVG**2*DELT
      ENDDO
      PRMS = SQRT(PRMS/(TRACE(80,1)-TRACE(0,1)))
      CALL SFT(TRACE(0,2),TRACE(0,1),80,HARM(1,1),HARM(1,2),40)
      DO IH=1,40
        HARM(IH,3) = 20.0*ALOG10(SQRT(0.5)*HARM(IH,1)/20.0E-6)
      ENDDO
      TOTAL(1) = PRMS
      TOTAL(2) = 20.0*ALOG10(PRMS/20.0E-6)
      TOTAL(3) = NBLDS*VEL/(RAD*ADV*PI/30.0)/60.0
      END
