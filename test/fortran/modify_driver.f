      PROGRAM MODIFY_DRIVER
      CHARACTER*32 COMMAND
C
      CALL GETARG(1,COMMAND)
C
      IF(COMMAND.EQ.'sort' .OR. COMMAND.EQ.'SORT') THEN
        CALL RUNSORT
      ELSEIF(COMMAND.EQ.'crsmod' .OR. COMMAND.EQ.'CRSMOD') THEN
        CALL RUNCRSMOD
      ELSE
        WRITE(*,*) 'unknown command'
        STOP 1
      ENDIF
C
      END


      SUBROUTINE RUNSORT
      INTEGER NMAX
      PARAMETER (NMAX=200)
      REAL S(NMAX), W(NMAX)
      INTEGER NW
      INTEGER I
C
      READ(*,*) NW
      DO I=1, NW
        READ(*,*) S(I)
      ENDDO
      DO I=1, NW
        READ(*,*) W(I)
      ENDDO
C
      CALL SORT(NW,S,W)
C
      WRITE(*,'(A)') 'RESULT SORT'
      CALL WINT(NW)
      DO I=1, NW
        CALL WREAL(S(I))
      ENDDO
      DO I=1, NW
        CALL WREAL(W(I))
      ENDDO
      RETURN
      END


      SUBROUTINE RUNCRSMOD
      INTEGER NMAX
      INTEGER MMAX
      PARAMETER (NMAX=200, MMAX=200)
      REAL X(NMAX), Y(NMAX), YP(NMAX)
      REAL XOFF, XSF, YOFF, YSF, SSIZ
      REAL CURX(MMAX), CURY(MMAX)
      INTEGER CURKEY(MMAX), NCUR, ICUR
      INTEGER N, NSPLT, LFLAG
      INTEGER IMOD1, IMOD2
      INTEGER I
      LOGICAL LSLOPE
      COMMON /CRSBUF/ CURX, CURY, CURKEY, NCUR, ICUR
C
      READ(*,*) N
      DO I=1, N
        READ(*,*) X(I)
      ENDDO
      DO I=1, N
        READ(*,*) Y(I)
      ENDDO
      DO I=1, N
        READ(*,*) YP(I)
      ENDDO
      READ(*,*) XOFF, XSF, YOFF, YSF, SSIZ
      READ(*,*) NSPLT
      READ(*,*) LFLAG
      LSLOPE = LFLAG .NE. 0
      READ(*,*) NCUR
      ICUR = 0
      DO I=1, NCUR
        READ(*,*) CURX(I), CURY(I), CURKEY(I)
      ENDDO
C
      CALL CRSMOD(N,X,Y,YP,
     &            XOFF,XSF,YOFF,YSF,SSIZ,NSPLT,
     &            LSLOPE,IMOD1,IMOD2)
C
      WRITE(*,'(A)') 'RESULT CRSMOD'
      CALL WINT(IMOD1)
      CALL WINT(IMOD2)
      DO I=1, N
        CALL WREAL(Y(I))
      ENDDO
      RETURN
      END


      SUBROUTINE GETCURSORXY(X,Y,KCHAR)
      INTEGER MMAX
      PARAMETER (MMAX=200)
      REAL X, Y
      REAL CURX(MMAX), CURY(MMAX)
      INTEGER CURKEY(MMAX), NCUR, ICUR
      CHARACTER*1 KCHAR
      COMMON /CRSBUF/ CURX, CURY, CURKEY, NCUR, ICUR
C
      ICUR = ICUR + 1
      IF(ICUR.GT.NCUR) THEN
        X = 0.0
        Y = 0.0
        KCHAR = 'Q'
        RETURN
      ENDIF
C
      X = CURX(ICUR)
      Y = CURY(ICUR)
      IF(CURKEY(ICUR).EQ.0) THEN
        KCHAR = ' '
      ELSE
        KCHAR = CHAR(CURKEY(ICUR))
      ENDIF
      RETURN
      END


      LOGICAL FUNCTION LABORT(X,Y)
      REAL X, Y
      LABORT = .FALSE.
      RETURN
      END


      LOGICAL FUNCTION LZOOM(X,Y)
      REAL X, Y
      LZOOM = .FALSE.
      RETURN
      END


      LOGICAL FUNCTION LUNZOOM(X,Y)
      REAL X, Y
      LUNZOOM = .FALSE.
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


      SUBROUTINE PLOT(X,Y,IPEN)
      REAL X, Y
      INTEGER IPEN
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
