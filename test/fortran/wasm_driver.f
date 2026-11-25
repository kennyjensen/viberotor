      PROGRAM WASM_REFERENCE
      REAL C(20),G(100,3),R(32),S(11,100),H(3,150)
      REAL OBS(4),TRACE(0:80,2),HARM(40,3),TOTAL(3)
      INTEGER MODE,NG,NH,II,ACOUSTIC
      READ(*,*) MODE,NG,ACOUSTIC
      READ(*,*) C
      DO I=1,NG
        READ(*,*) G(I,1),G(I,2),G(I,3)
      ENDDO
      READ(*,*) OBS
      CALL VRSOLVE(C,G,NG,MODE,R,S,H,NH)
      IF(NH.LT.0) STOP 1
      IF(ACOUSTIC.EQ.1) CALL VRNOISE(OBS,TRACE,HARM,TOTAL)
      WRITE(*,*) 'RESULT WASM'
      WRITE(*,*) NH
      WRITE(*,'(ES26.17E3)') R
      II = INT(C(12))
      DO I=1,II
        WRITE(*,'(ES26.17E3)') (S(J,I),J=1,11)
      ENDDO
      DO I=1,NH
        WRITE(*,'(ES26.17E3)') (H(J,I),J=1,3)
      ENDDO
      IF(ACOUSTIC.EQ.1) THEN
        WRITE(*,'(ES26.17E3)') TRACE,HARM,TOTAL
      ENDIF
      END
