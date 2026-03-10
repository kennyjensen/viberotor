      PROGRAM XMODI_DRIVER
      CHARACTER*32 COMMAND
C
      CALL GETARG(1,COMMAND)
C
      IF(COMMAND.EQ.'modi' .OR. COMMAND.EQ.'MODI') THEN
        CALL RUNMODI
      ELSEIF(COMMAND.EQ.'pltmod' .OR. COMMAND.EQ.'PLTMOD') THEN
        CALL RUNPLTMOD
      ELSE
        WRITE(*,*) 'unknown command'
        STOP 1
      ENDIF
C
      END


      SUBROUTINE RUNMODI
      CALL PREPSTATE
      CALL MODI
      CALL WRITEMODSTATE('MODI')
      RETURN
      END


      SUBROUTINE RUNPLTMOD
      INCLUDE 'XROTOR.INC'
      INTEGER NMAX
      PARAMETER (NMAX=200)
      REAL X(NMAX), Y(NMAX), YLIMS(2)
      REAL DYMIN, PLFAC, PLPAR, XOFF, XSF, YOFF, YSF
      INTEGER N, NSPLT
      INTEGER I
C
      CALL PREPSTATE
      READ(*,*) N
      DO I=1, N
        READ(*,*) X(I)
      ENDDO
      DO I=1, N
        READ(*,*) Y(I)
      ENDDO
      READ(*,*) DYMIN
      READ(*,*) YLIMS(1), YLIMS(2)
      READ(*,*) PLFAC, PLPAR, NSPLT
C
      CALL PLTMOD(N,X,Y,DYMIN,YLIMS,PLFAC,PLPAR,NSPLT,
     &            XOFF,XSF,YOFF,YSF)
C
      WRITE(*,'(A)') 'RESULT PLTMOD'
      CALL WREAL(DYMIN)
      CALL WREAL(XOFF)
      CALL WREAL(XSF)
      CALL WREAL(YOFF)
      CALL WREAL(YSF)
      RETURN
      END


      SUBROUTINE PREPSTATE
      INCLUDE 'XROTOR.INC'
C
      VERSION = 7.55
      LUREAD = 5
      LUWRIT = 6
      LUTEMP = 35
      LUSAVE = 4
      CALL SETDEF
C
      NAME = 'XMODI DRIVER'
      II = 5
      NAERO = 2
      NBLDS = 3
      FAST = .FALSE.
      FREE = .TRUE.
      DUCT = .TRUE.
      WIND = .FALSE.
      RAD = 1.45
      VEL = 42.0
      VSO = 339.0
      RHO = 1.19
      RMU = 1.82E-5
      ALT = 1.5
      ADV = 0.69
      ADW = 0.81
      RAKE = 0.04
      URDUCT = 1.07
      XI0 = 0.22
      XW0 = 0.24
      XITIP = 1.0
      IINF = II + II/2
      NITERA = 12
      ADWFCTR = 1.0
      CONV = .FALSE.
      LROTOR = .TRUE.
      PAR = 0.6
      CSIZE = 0.014
      SIZE = 10.0
      SCRNFR = 0.70
      IDEV = 1
      IDEVRP = 2
      IPSLU = 0
      LPLOT = .FALSE.
      LLAND = .TRUE.
      LGRID = .TRUE.
      XYOFF(1) = 0.0
      XYOFF(2) = 0.0
      XYFAC(1) = 1.0
      XYFAC(2) = 1.0
C
      XI(1) = 0.28
      XI(2) = 0.44
      XI(3) = 0.62
      XI(4) = 0.80
      XI(5) = 0.94
      DXI(1) = 0.14
      DXI(2) = 0.17
      DXI(3) = 0.18
      DXI(4) = 0.16
      DXI(5) = 0.11
      XV(1) = 0.22
      XV(2) = 0.35
      XV(3) = 0.53
      XV(4) = 0.71
      XV(5) = 0.88
      XV(6) = 1.00
C
      CH(1) = 0.23
      CH(2) = 0.20
      CH(3) = 0.17
      CH(4) = 0.14
      CH(5) = 0.11
      BETA(1) = 0.58
      BETA(2) = 0.51
      BETA(3) = 0.43
      BETA(4) = 0.35
      BETA(5) = 0.28
      BETA0(1) = 0.58
      BETA0(2) = 0.51
      BETA0(3) = 0.43
      BETA0(4) = 0.35
      BETA0(5) = 0.28
      UBODY(1) = 0.02
      UBODY(2) = 0.018
      UBODY(3) = 0.015
      UBODY(4) = 0.010
      UBODY(5) = 0.005
      GAM(1) = 0.09
      GAM(2) = 0.108
      GAM(3) = 0.104
      GAM(4) = 0.080
      GAM(5) = 0.050
C
      CALL PUTAERO(1,0.28,-0.04,1.32,-1.05,
     &             5.8,1.15,0.18,
     &             0.010,0.28,0.020,-0.08,0.71,1.9E6,-0.14)
      CALL PUTAERO(2,0.82,-0.025,1.18,-0.92,
     &             5.5,1.00,0.16,
     &             0.012,0.24,0.024,-0.06,0.68,2.2E6,-0.12)
      CALL SETIAERO
C
      NADD = 4
      RADD(1) = 0.42
      RADD(2) = 0.76
      RADD(3) = 1.06
      RADD(4) = 1.34
      UADD(1) = 1.6
      UADD(2) = 2.0
      UADD(3) = 1.8
      UADD(4) = 1.4
      VADD(1) = -0.25
      VADD(2) = -0.10
      VADD(3) = 0.05
      VADD(4) = 0.18
      CALL SPLINE(UADD,UADDR,RADD,NADD)
      CALL SPLINE(VADD,VADDR,RADD,NADD)
C
      CALL APER(4,2,.TRUE.)
      CONV = .TRUE.
      RETURN
      END


      SUBROUTINE WRITEMODSTATE(LABEL)
      INCLUDE 'XROTOR.INC'
      CHARACTER*(*) LABEL
      INTEGER I
C
      WRITE(*,'(A,1X,A)') 'RESULT', LABEL
      CALL WINT(NBLDS)
      CALL WINT(II)
      CALL WREAL(RAD)
      CALL WREAL(XI0)
      CALL WREAL(XW0)
      CALL WREAL(RAKE)
      CALL WREAL(XPITCH)
      CALL WREAL(SIZE)
      DO I=1, II
        CALL WREAL(CH(I))
      ENDDO
      DO I=1, II
        CALL WREAL(BETA(I))
      ENDDO
      DO I=1, II
        CALL WREAL(BETA0(I))
      ENDDO
      DO I=1, II
        CALL WREAL(XI(I))
      ENDDO
      DO I=1, II
        CALL WREAL(DXI(I))
      ENDDO
      DO I=1, II
        CALL WREAL(XW(I))
      ENDDO
      DO I=1, II
        CALL WREAL(DXW(I))
      ENDDO
      RETURN
      END


      SUBROUTINE GETCURSORXY(X,Y,KCHAR)
      REAL X, Y
      CHARACTER*1 KCHAR
      INTEGER KCODE
C
      READ(*,*) X, Y, KCODE
      IF(KCODE.EQ.0) THEN
        KCHAR = ' '
      ELSE
        KCHAR = CHAR(KCODE)
      ENDIF
      RETURN
      END


      SUBROUTINE PLOT(X,Y,IPEN)
      REAL X, Y
      INTEGER IPEN
      RETURN
      END


      SUBROUTINE PLOTABS(X,Y,IPEN)
      REAL X, Y
      INTEGER IPEN
      RETURN
      END


      SUBROUTINE GETCOLOR(ICOL0)
      INTEGER ICOL0
      ICOL0 = 0
      RETURN
      END


      SUBROUTINE PUNZOOM
      RETURN
      END


      SUBROUTINE PZOOM
      RETURN
      END


      SUBROUTINE PABORT
      RETURN
      END


      SUBROUTINE PLFLUSH
      RETURN
      END


      SUBROUTINE NEWCOLORNAME(NAME)
      CHARACTER*(*) NAME
      RETURN
      END


      SUBROUTINE PLSYMB(X,Y,SSIZ,ISYM,ANG,ICENT)
      REAL X, Y, SSIZ, ANG
      INTEGER ISYM, ICENT
      RETURN
      END


      SUBROUTINE USETZOOM(L1,L2)
      LOGICAL L1, L2
      RETURN
      END


      SUBROUTINE REPLOT(IDEV)
      INTEGER IDEV
      RETURN
      END


      SUBROUTINE CLRZOOM
      RETURN
      END


      SUBROUTINE NEWCOLOR(ICOL0)
      INTEGER ICOL0
      RETURN
      END


      SUBROUTINE PLTINI(SCRNFR,IPSLU,IDEV,FACTOR,LPLOT,LLAND)
      REAL SCRNFR, FACTOR
      INTEGER IPSLU, IDEV
      LOGICAL LPLOT, LLAND
      LPLOT = .TRUE.
      RETURN
      END


      SUBROUTINE NEWPEN(IPEN)
      INTEGER IPEN
      RETURN
      END


      SUBROUTINE XAXIS(X0,Y0,XLEN,DXANN,FANN,DANN,CHT,IFLAG)
      REAL X0, Y0, XLEN, DXANN, FANN, DANN, CHT
      INTEGER IFLAG
      RETURN
      END


      SUBROUTINE PLCHAR(XC,YC,CHX,STRING,ANGLE,NC)
      REAL XC, YC, CHX, ANGLE
      CHARACTER*(*) STRING
      INTEGER NC
      RETURN
      END


      SUBROUTINE PLMATH(XC,YC,CHX,STRING,ANGLE,NC)
      REAL XC, YC, CHX, ANGLE
      CHARACTER*(*) STRING
      INTEGER NC
      RETURN
      END


      SUBROUTINE YAXIS(X0,Y0,YLEN,DYANN,FANN,DANN,CHT,IFLAG)
      REAL X0, Y0, YLEN, DYANN, FANN, DANN, CHT
      INTEGER IFLAG
      RETURN
      END


      SUBROUTINE PLGRID(X0,Y0,NX,DX,NY,DY,LMASK)
      REAL X0, Y0, DX, DY
      INTEGER NX, NY, LMASK
      RETURN
      END


      SUBROUTINE XYSYMB(N,X,Y,XOFF,XSF,YOFF,YSF,SH,ISYM)
      INTEGER N, ISYM
      REAL X(*), Y(*), XOFF, XSF, YOFF, YSF, SH
      RETURN
      END


      SUBROUTINE XYLINE(N,X,Y,XOFF,XSF,YOFF,YSF,IPEN)
      INTEGER N, IPEN
      REAL X(*), Y(*), XOFF, XSF, YOFF, YSF
      RETURN
      END


      SUBROUTINE ANNOT(SIZE)
      REAL SIZE
      RETURN
      END


      SUBROUTINE PLEND
      RETURN
      END


      SUBROUTINE REFPLT(FNAME,XOFF,YOFF,XFAC,YFAC,SSIZE,ISYM)
      CHARACTER*(*) FNAME
      REAL XOFF, YOFF, XFAC, YFAC, SSIZE
      INTEGER ISYM
      RETURN
      END


      SUBROUTINE PLOT_DATA(PLTTYPE)
      CHARACTER*(*) PLTTYPE
      RETURN
      END


      SUBROUTINE GEOPLT(VIEW)
      CHARACTER*(*) VIEW
      RETURN
      END


      SUBROUTINE PRPPLT
      RETURN
      END


      SUBROUTINE CLPLT
      RETURN
      END


      SUBROUTINE UVIPLT
      RETURN
      END


      SUBROUTINE UVIPLT3
      RETURN
      END


      SUBROUTINE TRIPLT
      RETURN
      END


      SUBROUTINE VELPLT
      RETURN
      END


      SUBROUTINE DESMIL(ICASE)
      INCLUDE 'XROTOR.INC'
      INTEGER ICASE
      CONV = .FALSE.
      RETURN
      END


      LOGICAL FUNCTION LABORT(XC,YC)
      REAL XC, YC
      LABORT = .FALSE.
      RETURN
      END


      LOGICAL FUNCTION LZOOM(XC,YC)
      REAL XC, YC
      LZOOM = .FALSE.
      RETURN
      END


      LOGICAL FUNCTION LUNZOOM(XC,YC)
      REAL XC, YC
      LUNZOOM = .FALSE.
      RETURN
      END


      SUBROUTINE SCALIT(II,Y,YOFF,YSF)
      DIMENSION Y(II)
C
      AG2 = ALOG10(2.0)
      AG5 = ALOG10(5.0)
C
      YMAX = ABS(Y(1) - YOFF)
      DO 10 I=2, II
        YMAX = MAX( YMAX , ABS(Y(I)-YOFF) )
   10 CONTINUE
C
      IF(YMAX .EQ. 0.0) THEN
        YSF = 1.0E8
        RETURN
      ENDIF
C
      YLOG = ALOG10(YMAX)
      YLOG1 = AINT(YLOG+100.0) - 99.0
      YLOG2 = YLOG1 + AG2
      IF(YLOG2-1.0.GT.YLOG) YLOG2 = YLOG2 - 1.0
      YLOG5 = YLOG1 + AG5
      IF(YLOG5-1.0.GT.YLOG) YLOG5 = YLOG5 - 1.0
      GMIN = AMIN1( YLOG1 , YLOG2 , YLOG5 )
      YSF = 10.0**(-GMIN)
      RETURN
      END


      SUBROUTINE WREAL(X)
      REAL X
      WRITE(*,'(1X,ES24.16)') X
      RETURN
      END


      SUBROUTINE WINT(I)
      INTEGER I
      WRITE(*,'(1X,I12)') I
      RETURN
      END
